#!/usr/bin/env python3
"""Install the reviewed R2 configuration without restarting any service.

Private configuration backup and schema/data dump precede changes. No secrets
appear in output. Existing Compose services other than Storage must be identical.
"""
import argparse
import gzip
import json
import os
from pathlib import Path
import subprocess

import migrate


def configure(project):
    name, db, _, bucket = migrate.PROJECTS[project]
    d = migrate.inspect(name)
    labels = d['Config']['Labels']
    files = labels['com.docker.compose.project.config_files'].split(',')
    workdir = Path(labels['com.docker.compose.project.working_dir'])
    command = ['docker', 'compose']
    for file in files:
        command += ['-f', file]
    before = json.loads(subprocess.check_output(command + ['config', '--format', 'json'], cwd=workdir))
    backup = migrate.STATE / (project + '-before')
    if backup.exists():
        raise RuntimeError('Configuration backup exists; inspect instead of repeating')
    backup.mkdir(parents=True, mode=0o700)
    for file in files:
        (backup / Path(file).name).write_bytes(Path(file).read_bytes())
        os.chmod(backup / Path(file).name, 0o600)
    migrate.write_private(backup / 'container.json', d)
    dump = subprocess.check_output(['docker', 'exec', db, 'pg_dump', '-U', 'postgres',
                                    '-d', 'postgres', '--schema=storage', '--no-owner'])
    dump_path = backup / 'storage.sql.gz'
    dump_path.write_bytes(gzip.compress(dump))
    os.chmod(dump_path, 0o600)
    e = migrate.credentials(project)
    settings = {'STORAGE_BACKEND': 's3', 'GLOBAL_S3_BUCKET': bucket,
                'GLOBAL_S3_ENDPOINT': e['R2_ENDPOINT'],
                'GLOBAL_S3_FORCE_PATH_STYLE': 'true', 'STORAGE_S3_REGION': 'auto',
                'STORAGE_R2_ACCOUNT_ID': e['R2_ACCOUNT_ID'],
                'STORAGE_S3_REQUEST_CHECKSUM_CALCULATION': 'WHEN_REQUIRED',
                'STORAGE_S3_RESPONSE_CHECKSUM_VALIDATION': 'WHEN_REQUIRED'}
    secrets = {'AWS_ACCESS_KEY_ID': e['R2_ACCESS_KEY_ID'],
               'AWS_SECRET_ACCESS_KEY': e['R2_SECRET_ACCESS_KEY']}
    env = workdir / 'storage-r2.env'
    if env.exists():
        raise RuntimeError('Private env file already exists')
    if any(any(c in v for c in '\r\n\x00') for v in secrets.values()):
        raise RuntimeError('Invalid credential format')
    with os.fdopen(os.open(env, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as f:
        f.write(''.join(k + '=' + v + '\n' for k, v in secrets.items()))
    target = Path(files[-1])
    try:
        if project == 'connectyhub':
            original = target.read_text()
            if '\n  storage:' in original:
                raise RuntimeError('Unexpected existing Storage override')
            addition = '\n  storage:\n    env_file:\n      - ./storage-r2.env\n    environment:\n'
            addition += ''.join('      ' + k + ': ' + json.dumps(v) + '\n' for k, v in settings.items())
            target.write_text(original + addition)
        else:
            config = json.loads(target.read_text())
            service = config['services']['storage']
            if service.get('env_file'):
                raise RuntimeError('Unexpected existing Storage env_file')
            service['env_file'] = ['./storage-r2.env']
            service['environment'].update(settings)
            target.write_text(json.dumps(config, indent=2) + '\n')
        after = json.loads(subprocess.check_output(command + ['config', '--format', 'json'], cwd=workdir))
        for cfg in (before, after):
            cfg['services'].pop('storage')
        if before != after:
            raise RuntimeError('Unexpected change outside Storage')
    except Exception:
        target.write_bytes((backup / target.name).read_bytes())
        raise
    print(json.dumps({'project': project, 'configuration_ready': True,
                      'other_services_unchanged': True, 'backup_complete': True}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('project', choices=migrate.PROJECTS)
    args = parser.parse_args()
    try:
        configure(args.project)
    except Exception as ex:
        print(json.dumps({'failed': True, 'error_type': type(ex).__name__}))
        raise SystemExit(1)

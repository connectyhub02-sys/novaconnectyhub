// Loaded only by the standalone Vite pilot. Never imported by the Next application.
export * from '../../src/lib/managed-projects/server';
import {pilotClient,context,users} from './pilot-db';
export const managedEnabled=()=>true;
export async function managedSession(){const userId=context.getStore()?.user??users.connectyhub;const db=pilotClient();return {db,userId,admin:userId===users.admin};}

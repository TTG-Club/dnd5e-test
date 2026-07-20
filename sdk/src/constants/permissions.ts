import type { PermissionKey, UserRole } from '../types/base.js';

export type { PermissionKey };

export const ALL_ROLES: UserRole[] = ['guest', 'user', 'admin'];

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  guest: ['SCENE_PING'],
  user: [
    'ADD_SCENE_ASSETS',
    'USE_DRAWING_TOOLS',
    'SCENE_PING',
    'CONFIGURE_TOKENS',
    'TOGGLE_DOORS',
    'CREATE_ACTORS',
    'CREATE_JOURNALS',
    'CREATE_SCENE_NOTES',
    'CREATE_ITEMS',
    'CREATE_TOKENS',
    'CREATE_MEASUREMENT_TEMPLATES',
    'DELETE_TOKENS',
  ],
  admin: [
    'ADD_SCENE_ASSETS',
    'MANAGE_SETTINGS',
    'USE_DRAWING_TOOLS',
    'SCENE_PING',
    'CONFIGURE_TOKENS',
    'TOGGLE_DOORS',
    'CREATE_ACTORS',
    'CREATE_JOURNALS',
    'CREATE_SCENE_NOTES',
    'CREATE_ITEMS',
    'CREATE_TOKENS',
    'CREATE_MEASUREMENT_TEMPLATES',
    'DELETE_TOKENS',
    'MANAGE_PLAYLISTS',
    'PLAY_SOUNDS',
    'TOGGLE_PAUSE',
  ],
};

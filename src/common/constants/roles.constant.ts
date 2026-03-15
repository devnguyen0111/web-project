export enum Role {
  GUEST = 'guest',
  AUTHOR = 'author',
  STAFF = 'staff',
  ADMIN = 'admin',
}

export const AUTHENTICATED_ROLES: Role[] = [
  Role.AUTHOR,
  Role.STAFF,
  Role.ADMIN,
];

export const AUTHOR_PLUS_ROLES: Role[] = [Role.AUTHOR, Role.STAFF, Role.ADMIN];

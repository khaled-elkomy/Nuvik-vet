export interface RequestAuth {
  userId: string;
  clinicId: string;
  branchId: string;
  permissions: string[];
}

export interface AuthUser extends RequestAuth {
  displayName: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: RequestAuth;
      user?: AuthUser;
    }
  }
}

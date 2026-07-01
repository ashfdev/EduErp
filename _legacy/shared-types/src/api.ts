export interface ApiError {
  error: string;
  details?: unknown;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    role: string;
  };
}

export interface AuthenticatedUser {
  id: string;
  tenantId: string | null;
  role: string;
  name: string;
}

export interface AuthResponse {
  access_token: string;
  expires_in: string | number;
  user?: {
    email: string;
    name: string;
    role: string;
  };
}

export interface Profile {
  id: string;
  name: string;
  email: string;
}

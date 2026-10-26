import { apiFetch } from "@/lib/api";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "customer" | "admin";
};

type CurrentUserResponse = {
  status: string;
  data: {
    user: AuthUser;
  };
};

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const response = await apiFetch<CurrentUserResponse>("/auth/me");

    return response.data.user;
  } catch {
    return null;
  }
}

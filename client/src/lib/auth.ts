import { apiFetch, ApiRequestError } from "@/lib/api";

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

// ======================================
// GET CURRENT LOGGED-IN CUSTOMER
// ======================================
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const response = await apiFetch<CurrentUserResponse>("/auth/me");

    return response.data.user;
  } catch (error) {
    // 401 means authentication is unavailable
    // or the login session has expired.
    if (error instanceof ApiRequestError && error.status === 401) {
      return null;
    }

    // Do not hide network errors or server failures.
    throw error;
  }
}

import { cookies } from "next/headers";
import { getSessionPhone, SESSION_COOKIE } from "./session";

// Returns the authenticated user's phone, or null if there's no valid session.
export async function getSessionUserPhone() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return getSessionPhone(token);
}

import { useState, useEffect } from "react";
import { useMsal } from "@azure/msal-react";
import type { AccountInfo } from "@azure/msal-browser";
import { acquireAccessTokenSilentOrRedirect, fetchWithAuthRecovery } from "../utils/authRecovery";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UserProfile {
  displayName: string;
  email: string;
  phone: string;
  department: string;
  jobTitle: string;
  loading: boolean;
  error: string | null;
}

// ── MS Graph response types ────────────────────────────────────────────────────

interface GraphUserResponse {
  displayName: string | null;
  mail: string | null;
  userPrincipalName: string;
  mobilePhone: string | null;
  businessPhones: string[];
  department: string | null;
  jobTitle: string | null;
}

// ── Default state ──────────────────────────────────────────────────────────────

const defaultProfile: UserProfile = {
  displayName: "",
  email: "",
  phone: "",
  department: "",
  jobTitle: "",
  loading: true,
  error: null,
};

// ── Extract phone from Graph response ─────────────────────────────────────────

function extractPhone(user: GraphUserResponse): string {
  if (user.mobilePhone && user.mobilePhone.trim() !== "") {
    return user.mobilePhone;
  }
  if (user.businessPhones.length > 0 && user.businessPhones[0]) {
    return user.businessPhones[0];
  }
  return "";
}

// ── The hook ───────────────────────────────────────────────────────────────────

export function useUserProfile(): UserProfile {
  const { instance, accounts } = useMsal();
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);

  const account: AccountInfo | undefined = instance.getActiveAccount() ?? accounts[0];
  const userIdentifier = account?.username ?? "";

  useEffect(() => {
    let cancelled = false;

    async function fetchProfile(): Promise<void> {
      if (!account || !userIdentifier) {
        setProfile({
          ...defaultProfile,
          loading: false,
          error: "No signed-in user",
        });
        return;
      }

      try {
        const accessToken = await acquireAccessTokenSilentOrRedirect(instance, {
          scopes: ["User.Read"],
          account,
        });

        const response = await fetchWithAuthRecovery(
          "https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName,mobilePhone,businessPhones,department,jobTitle",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error(`Graph API error: ${response.status}`);
        }

        const user: GraphUserResponse = (await response.json()) as GraphUserResponse;

        if (!cancelled) {
          setProfile({
            displayName: user.displayName ?? "",
            email: user.mail || user.userPrincipalName,
            phone: extractPhone(user),
            department: user.department ?? "",
            jobTitle: user.jobTitle ?? "",
            loading: false,
            error: null,
          });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Failed to load profile";
          setProfile({
            ...defaultProfile,
            loading: false,
            error: message,
          });
        }
      }
    }

    void fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [instance, userIdentifier]);

  return profile;
}

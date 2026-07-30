import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "../auth/msalConfig";
import { type ReactNode } from "react";

interface AuthProviderProps {
  children: ReactNode;
}

export default function AuthProvider({ children }: AuthProviderProps) {
  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}

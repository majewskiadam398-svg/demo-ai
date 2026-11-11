import type { Metadata } from "next";
import "./style.css";
export const metadata: Metadata = { title: "ChessMind AI", description: "Analizuj. Przewiduj. Rozwijaj się." };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="pl"><body>{children}</body></html>;
}

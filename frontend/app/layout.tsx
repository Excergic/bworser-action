import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Sora, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-var",
});

export const metadata: Metadata = {
  title: "StudyMate – Ask anything",
  description: "AI-powered study assistant. Ask anything, get clear answers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
    >
      <html
        lang="en"
        className={`${sora.variable} ${jakarta.variable} ${jetbrains.variable}`}
        suppressHydrationWarning
      >
        <body className="antialiased">
          {/* Anti-FOUC: must be first in body so theme applies before any paint */}
          <script
            dangerouslySetInnerHTML={{
              __html: `try{var t=localStorage.getItem('studymate-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}`,
            }}
          />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}

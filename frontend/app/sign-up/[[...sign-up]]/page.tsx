import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center p-6">
      <SignUp
        appearance={{
          variables: {
            colorPrimary: "#10b981",
            colorBackground: "#18181b",
            colorInputBackground: "#27272a",
            colorInputText: "#fafafa",
            borderRadius: "0.75rem",
          },
        }}
      />
    </div>
  );
}

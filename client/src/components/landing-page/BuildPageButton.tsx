import { useRouter } from "next/navigation";
import { useState } from "react";

export const BuildPageButton = ({ conversationId }: { conversationId: string }) => {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/landing-page/generate", {
        method: "POST",
        body: JSON.stringify({ conversationId }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/build/${data.landingPage.id}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button onClick={handleGenerate} disabled={isLoading} className="mt-4 ...">
      {isLoading ? "Building..." : "🚀 Build Validation Page"}
    </button>
  );
};
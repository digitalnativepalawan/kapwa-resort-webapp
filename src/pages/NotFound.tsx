import { useNavigate } from "react-router-dom";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy-texture px-4">
      <h1 className="font-display text-6xl text-gold mb-2">404</h1>
      <p className="font-body text-lg text-cream-dim mb-8">Page not found</p>
      <Button
        onClick={() => navigate('/')}
        variant="outline"
        className="font-display tracking-wider gap-2 min-h-[44px] min-w-[44px]"
      >
        <Home className="w-5 h-5" />
        Return Home
      </Button>
    </div>
  );
};

export default NotFound;

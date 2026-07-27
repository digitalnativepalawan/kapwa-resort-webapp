import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Bot } from 'lucide-react';

/**
 * Back-office entry point to the Resort Operator agent.
 *
 * The Admin page used to mount the guest concierge (`AgentChatPanel`) and hang
 * this link off it. That component always loaded the guest persona, the guest
 * FAQ memory and the `guest-chat` function — it only checked whether it was on
 * an Admin route in order to render this one extra button. So TALA answering
 * back-office questions as if it were talking to a guest was exactly what the
 * component tree asked for.
 *
 * The two agents are now separate surfaces:
 *   TALA (guest concierge) — Guest Portal only, guest context, guest tools.
 *   Resort Operator        — back office only, live operational state,
 *                            approval-gated writes.
 */
const ResortOperatorLauncher = () => {
  const navigate = useNavigate();

  return (
    <Button
      onClick={() => navigate('/admin/operator')}
      variant="outline"
      className="fixed bottom-6 right-6 z-50 h-14 rounded-full shadow-lg px-5 bg-card"
    >
      <Bot className="w-5 h-5 mr-2" />
      Resort Operator
    </Button>
  );
};

export default ResortOperatorLauncher;

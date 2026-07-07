// src/components/admin/tools/PostModal.tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, RefreshCw, X } from "lucide-react";
import { generateSocialPost, copyToClipboard, type ToolData } from "@/lib/socialGenerator";
import { toast } from "sonner";

interface PostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tool: ToolData | null;
}

export function PostModal({ open, onOpenChange, tool }: PostModalProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!tool) return;
    setLoading(true);
    const post = await generateSocialPost(tool);
    setContent(post);
    setLoading(false);
  };

  const handleCopy = async () => {
    if (!content) return;
    await copyToClipboard(content);
    toast.success("Copied to clipboard!");
  };

  const handleClose = () => {
    setContent("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>📱 Create Post: {tool?.name}</DialogTitle>
            <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!content && !loading && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-4">Generate social media content for this tool</p>
              <Button onClick={handleGenerate} className="w-full">
                Generate Content
              </Button>
            </div>
          )}

          {loading && (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
              <p className="text-sm text-muted-foreground">Generating...</p>
            </div>
          )}

          {content && (
            <>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                className="resize-none"
              />
              <div className="flex gap-2">
                <Button onClick={handleCopy} className="flex-1">
                  <Copy className="h-4 w-4 mr-2" /> Copy
                </Button>
                <Button onClick={handleGenerate} variant="outline" className="flex-1">
                  <RefreshCw className="h-4 w-4 mr-2" /> Regenerate
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Prompt Improve</CardTitle>
          <CardDescription>
            Melhore o texto selecionado com um LLM compatível com OpenAI.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" disabled>
            Em breve
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default App;

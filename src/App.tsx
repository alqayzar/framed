import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function App() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Hello world 👋</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-muted-foreground">
            Bienvenue sur <strong>Framed</strong>, un jeu de déduction sociale
            en pair-à-pair.
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge>React</Badge>
            <Badge variant="secondary">TypeScript</Badge>
            <Badge variant="secondary">Tailwind</Badge>
            <Badge variant="secondary">shadcn/ui</Badge>
            <Badge variant="outline">PeerJS</Badge>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

export default App

/** Greeting for the Today page. The logo lives at the top left of the app. */
export function Hero({ emoji, greeting }: { emoji: string; greeting: string }) {
  return (
    <h1 className="greeting">
      <span aria-hidden="true">{emoji}</span> {greeting}
    </h1>
  );
}

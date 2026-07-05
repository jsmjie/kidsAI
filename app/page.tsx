import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home-page">
      <section className="home-panel">
        <p>Kids AI</p>
        <h1>A safe thinking chatbot for kids.</h1>
        <Link href="/chat">Start chat</Link>
      </section>
    </main>
  );
}

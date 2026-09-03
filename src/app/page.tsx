import Link from 'next/link';

/**
 * Page racine provisoire. L'accueil commercial est construit au lot 5 ; en
 * attendant, elle mène au back-office, seul espace livré.
 */
export default function PageRacine() {
  return (
    <main style={{ padding: '40px' }}>
      <p style={{ fontSize: 'var(--body-md-size)', color: 'var(--text-secondary)' }}>
        L&apos;entraînement des commerciaux arrive au lot 5.
      </p>
      <p>
        <Link href="/admin/questions">Accéder au back-office pédagogique</Link>
      </p>
    </main>
  );
}

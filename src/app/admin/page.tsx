import { redirect } from 'next/navigation';

/** L'entrée du back-office est la banque de questions. */
export default function PageAdmin() {
  redirect('/admin/questions');
}

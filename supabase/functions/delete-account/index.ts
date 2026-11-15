// Permanently deletes the caller's account. Database rows cascade from auth.users →
// profiles → all personal data (see migrations). Storage files are removed explicitly.
import { authenticate, json, serve } from '../_server/http.ts';

serve(async (req) => {
  const { user, admin } = await authenticate(req);
  for (const bucket of ['avatars', 'group-photos']) {
    const { data: files } = await admin.storage.from(bucket).list(user.id, { limit: 1000 });
    if (files?.length) await admin.storage.from(bucket).remove(files.map((f) => `${user.id}/${f.name}`));
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return json({ error: 'Couldn’t delete the account. Please try again or contact support.', code: 'unknown' }, 500);
  return json({ deleted: true });
});

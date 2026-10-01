import { redirect } from 'next/navigation';
import { TaskForm } from '@/components/TaskForm';
import { proposeTaskAction } from '@/lib/actions';
import { getCoupleContext, getSession, isLinked } from '@/lib/data';

export default async function NewTaskPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const context = await getCoupleContext(session);
  if (!isLinked(context) || !context) redirect('/link');

  return (
    <div className="stack">
      <div className="stack-tight">
        <h1>Add a task</h1>
        <p className="muted">
          {context.partner?.display_name} sees this as a suggestion and approves it before it
          joins your list.
        </p>
      </div>
      <div className="card">
        <TaskForm
          action={proposeTaskAction}
          submitLabel="Send to my partner"
          today={context.today}
        />
      </div>
    </div>
  );
}

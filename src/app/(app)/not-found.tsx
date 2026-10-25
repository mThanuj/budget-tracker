import { NotFoundView } from "@/components/app/status-view";

// notFound() inside the app (e.g. /admin for non-admins): keeps the navigation.
export default function NotFound() {
  return <NotFoundView />;
}

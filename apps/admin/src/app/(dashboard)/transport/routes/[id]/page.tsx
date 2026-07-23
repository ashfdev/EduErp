"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, EmptyState, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Route {
  id: string;
  name: string;
  fare: number;
  stops: { id: string; name: string; time: string | null }[];
}
interface Vehicle {
  id: string;
  route_id: string | null;
  vehicle_no: string;
  type: string;
  driver_name: string | null;
  driver_phone: string | null;
}
interface StudentAssignment {
  id: string;
  pickup_stop: string | null;
  student: { id: string; name_en: string; student_uid: string; current_class: { name_en: string } | null };
}

export default function RouteManifestPage() {
  const { id } = useParams<{ id: string }>();

  const { data: routes } = useQuery<Route[]>({ queryKey: ["transport", "routes"], queryFn: async () => (await api.get("/api/transport/routes")).data.data });
  const route = routes?.find((r) => r.id === id);

  const { data: vehicles } = useQuery<Vehicle[]>({ queryKey: ["transport", "vehicles"], queryFn: async () => (await api.get("/api/transport/vehicles")).data.data });
  const routeVehicles = vehicles?.filter((v) => v.route_id === id);

  const { data: students } = useQuery<StudentAssignment[]>({ queryKey: ["transport", "routes", id, "students"], queryFn: async () => (await api.get(`/api/transport/routes/${id}/students`)).data.data });

  if (!route) return <PageWrapper><p className="text-sm text-muted-foreground">Loading...</p></PageWrapper>;

  return (
    <PageWrapper>
      <PageHeader title={route.name} breadcrumbs={[{ label: "Transport", href: "/transport" }, { label: route.name }]} />

      <Card>
        <CardContent className="pt-6">
          <p className="mb-2 font-medium">Stops</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {route.stops.map((s, i) => (
              <span key={s.id} className="rounded-full border px-3 py-1">{i + 1}. {s.name} {s.time && `(${s.time})`}</span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <p className="mb-2 font-medium">Vehicles</p>
          {!routeVehicles?.length && <p className="text-sm text-muted-foreground">No vehicle assigned to this route yet.</p>}
          {routeVehicles?.map((v) => (
            <p key={v.id} className="text-sm">{v.vehicle_no} ({v.type}) — Driver: {v.driver_name ?? "N/A"} {v.driver_phone && `(${v.driver_phone})`}</p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 print:p-0">
          <p className="mb-2 font-medium">Passenger Manifest ({students?.length ?? 0})</p>
          {!students?.length && <EmptyState title="No students assigned to this route" />}
          {!!students?.length && (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Student</TableHead><TableHead>ID</TableHead><TableHead>Class</TableHead><TableHead>Pickup Stop</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.student.name_en}</TableCell>
                    <TableCell className="font-mono text-xs">{s.student.student_uid}</TableCell>
                    <TableCell>{s.student.current_class?.name_en ?? "-"}</TableCell>
                    <TableCell>{s.pickup_stop ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageWrapper>
  );
}

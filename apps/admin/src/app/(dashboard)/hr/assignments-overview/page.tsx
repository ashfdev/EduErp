"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PageWrapper, PageHeader, Card, CardContent, SearchInput, Badge, Label, EmptyState, ErrorState, LoadingSpinner,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Tabs, TabsList, TabsTrigger, TabsContent, extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface TodaysClass {
  period_no: number;
  class_name: string;
  section_name: string;
  subject_name: string | null;
  room_name: string | null;
}
interface TeacherRow {
  staff_id: string;
  name_en: string;
  staff_uid: string;
  phone: string | null;
  designation: string | null;
  role: string;
  todays_classes: TodaysClass[];
}
interface AssignmentsOverviewResponse {
  day_of_week: number;
  teachers: TeacherRow[];
}

interface ClassOption {
  id: string;
  name_en: string;
}
interface RoomOption {
  id: string;
  name: string;
}
interface Shift {
  id: string;
  name: string;
}

interface OccupiedBy {
  class_name: string;
  section_name: string | null;
  subject_name: string | null;
}
interface AvailRow {
  id: string;
  name?: string;
  name_en?: string;
  designation?: string | null;
  is_lab?: boolean;
  status: "FREE" | "OCCUPIED";
  occupied_by: OccupiedBy | null;
}
interface PeriodAvailability {
  period_no: number;
  start_time: string;
  end_time: string;
  rooms: AvailRow[];
  teachers: AvailRow[];
}

export default function AssignmentsOverviewPage() {
  const today = new Date().getDay();
  const [search, setSearch] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(today);
  const [classId, setClassId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [shiftId, setShiftId] = useState("");

  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes", "list"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const { data: rooms } = useQuery<RoomOption[]>({
    queryKey: ["settings", "rooms"],
    queryFn: async () => (await api.get("/api/settings/rooms")).data.data,
  });
  const { data: shifts } = useQuery<Shift[]>({
    queryKey: ["settings", "shifts"],
    queryFn: async () => (await api.get("/api/settings/shifts")).data.data,
  });

  const { data, isLoading, isError, error, refetch } = useQuery<AssignmentsOverviewResponse>({
    queryKey: ["staff", "assignments-overview", search, dayOfWeek, classId, roomId],
    queryFn: async () =>
      (
        await api.get("/api/staff/assignments-overview", {
          params: { search: search || undefined, day_of_week: dayOfWeek, class_id: classId || undefined, room_id: roomId || undefined },
        })
      ).data.data,
  });

  const { data: availability, isLoading: availLoading, isError: availError, error: availErrorObj, refetch: refetchAvail } = useQuery<PeriodAvailability[]>({
    queryKey: ["settings", "routine", "availability", dayOfWeek, shiftId],
    queryFn: async () => (await api.get("/api/settings/routine/availability", { params: { day_of_week: dayOfWeek, shift_id: shiftId } })).data.data,
    enabled: !!shiftId,
  });

  const teachers = data?.teachers ?? [];

  return (
    <PageWrapper>
      <PageHeader
        title="Teacher Assignment Overview"
        subtitle="Every teacher's real schedule for a given day — plus which teachers and rooms are free, right here, no scrolling."
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Assignment Overview" }]}
      />

      <div className="max-w-xs space-y-1.5">
        <Label>Day</Label>
        <select className="w-full rounded-md border px-3 py-2 text-sm" value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
          {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
      </div>

      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">Teacher Schedule</TabsTrigger>
          <TabsTrigger value="availability">Available Teachers &amp; Rooms</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Class</Label>
                <select className="w-full rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => setClassId(e.target.value)}>
                  <option value="">All classes</option>
                  {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Room</Label>
                <select className="w-full rounded-md border px-3 py-2 text-sm" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                  <option value="">All rooms</option>
                  {rooms?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Search</Label>
                <SearchInput placeholder="Name, staff ID, or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : isError ? (
            <ErrorState title="Failed to load teacher schedules" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
          ) : !teachers.length ? (
            <EmptyState title="No teachers found" description="Try a different day, class, room, or search." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Teacher</TableHead>
                      <TableHead>Staff ID</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead>{DAY_NAMES[dayOfWeek]}&apos;s Classes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teachers.map((t) => (
                      <TableRow key={t.staff_id}>
                        <TableCell className="font-medium">{t.name_en}</TableCell>
                        <TableCell className="font-mono text-xs">{t.staff_uid}</TableCell>
                        <TableCell>{t.phone ?? "-"}</TableCell>
                        <TableCell>{t.designation ?? t.role.replace(/_/g, " ")}</TableCell>
                        <TableCell>
                          {t.todays_classes.length ? (
                            <div className="flex flex-col gap-1">
                              {t.todays_classes.map((c, i) => (
                                <div key={i} className="flex flex-wrap items-center gap-1 text-xs">
                                  <Badge variant="outline">P{c.period_no}</Badge>
                                  <span>{c.subject_name ?? "—"} — {c.class_name} ({c.section_name})</span>
                                  <Badge variant={c.room_name ? "secondary" : "outline"} className="ml-1">
                                    {c.room_name ?? "No room set"}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No classes</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="availability" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="max-w-xs space-y-1.5">
                <Label>Shift</Label>
                <select className="w-full rounded-md border px-3 py-2 text-sm" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
                  <option value="">Select a shift to see availability...</option>
                  {shifts?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </CardContent>
          </Card>

          {!shiftId ? (
            <EmptyState title="Pick a shift" description="Select a shift above to see room and teacher availability for this day." />
          ) : availLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : availError ? (
            <ErrorState title="Failed to load availability" description={extractErrorMessage(availErrorObj)} retryLabel="Retry" onRetry={() => refetchAvail()} />
          ) : !availability?.length ? (
            <EmptyState title="No periods configured" description="This shift has no periods set up yet — add them under Settings → Shifts → Periods." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Available Teachers</TableHead>
                      <TableHead>Available Rooms</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availability.map((p) => {
                      const freeTeachers = p.teachers.filter((t) => t.status === "FREE");
                      const freeRooms = p.rooms.filter((r) => r.status === "FREE");
                      return (
                        <TableRow key={p.period_no}>
                          <TableCell>P{p.period_no}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{p.start_time} – {p.end_time}</TableCell>
                          <TableCell className="max-w-xs text-xs">
                            {freeTeachers.length ? (
                              <>
                                <Badge variant="success" className="mb-1">{freeTeachers.length} free</Badge>
                                <div className="text-muted-foreground">{freeTeachers.map((t) => t.name_en).join(", ")}</div>
                              </>
                            ) : (
                              <Badge variant="destructive">None free</Badge>
                            )}
                          </TableCell>
                          <TableCell className="max-w-xs text-xs">
                            {freeRooms.length ? (
                              <>
                                <Badge variant="success" className="mb-1">{freeRooms.length} free</Badge>
                                <div className="text-muted-foreground">{freeRooms.map((r) => r.name).join(", ")}</div>
                              </>
                            ) : (
                              <Badge variant="destructive">None free</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {rooms && rooms.length <= 1 && (
                  <p className="border-t p-3 text-xs text-muted-foreground">
                    Only {rooms.length} room{rooms.length === 1 ? " is" : "s are"} configured in Settings → Rooms — add more there (e.g. regular classrooms, other labs) to see them here too.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </PageWrapper>
  );
}

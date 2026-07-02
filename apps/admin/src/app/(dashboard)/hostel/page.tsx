"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, StatusBadge, EmptyState,
  Tabs, TabsList, TabsTrigger, TabsContent, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface Block {
  id: string;
  name: string;
  type: string | null;
  rooms: { id: string; room_no: string; capacity: number; _count: { allocations: number } }[];
}
interface Room {
  id: string;
  room_no: string;
  capacity: number;
  occupied: number;
  beds_free: number;
  block: { name: string };
}
interface StudentRow {
  id: string;
  name_en: string;
  student_uid: string;
}
interface Visitor {
  id: string;
  visitor_name: string;
  relation: string;
  phone: string;
  in_time: string;
  out_time: string | null;
}
interface Occupancy {
  total_capacity: number;
  total_occupied: number;
  fill_rate: number;
  rooms: { id: string; block_name: string; room_no: string; capacity: number; occupied: number; fill_rate: number }[];
}

function RoomsTab() {
  const queryClient = useQueryClient();
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockName, setBlockName] = useState("");
  const [blockType, setBlockType] = useState("");
  const [roomOpen, setRoomOpen] = useState(false);
  const [roomBlockId, setRoomBlockId] = useState("");
  const [roomNo, setRoomNo] = useState("");
  const [roomCapacity, setRoomCapacity] = useState(4);

  const [allocateOpen, setAllocateOpen] = useState(false);
  const [allocateRoomId, setAllocateRoomId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);

  const { data: blocks } = useQuery<Block[]>({ queryKey: ["hostel", "blocks"], queryFn: async () => (await api.get("/api/hostel/blocks")).data.data });
  const { data: rooms } = useQuery<Room[]>({ queryKey: ["hostel", "rooms"], queryFn: async () => (await api.get("/api/hostel/rooms")).data.data });

  const { data: students } = useQuery<StudentRow[]>({
    queryKey: ["students", "search", studentSearch],
    queryFn: async () => (await api.get("/api/students", { params: { search: studentSearch, limit: 5 } })).data.data,
    enabled: studentSearch.length > 1 && !selectedStudent,
  });

  const createBlockMutation = useMutation({
    mutationFn: () => api.post("/api/hostel/blocks", { name: blockName, type: blockType || undefined }),
    onSuccess: () => {
      toast.success("Block added");
      queryClient.invalidateQueries({ queryKey: ["hostel", "blocks"] });
      setBlockOpen(false);
      setBlockName(""); setBlockType("");
    },
  });

  const createRoomMutation = useMutation({
    mutationFn: () => api.post("/api/hostel/rooms", { block_id: roomBlockId, room_no: roomNo, capacity: roomCapacity }),
    onSuccess: () => {
      toast.success("Room added");
      queryClient.invalidateQueries({ queryKey: ["hostel", "blocks"] });
      queryClient.invalidateQueries({ queryKey: ["hostel", "rooms"] });
      setRoomOpen(false);
      setRoomNo(""); setRoomCapacity(4);
    },
  });

  const allocateMutation = useMutation({
    mutationFn: () => api.post("/api/hostel/allocate", { room_id: allocateRoomId, student_id: selectedStudent!.id, from_date: new Date().toISOString().slice(0, 10) }),
    onSuccess: () => {
      toast.success("Student allocated");
      queryClient.invalidateQueries({ queryKey: ["hostel", "rooms"] });
      setAllocateOpen(false);
      setSelectedStudent(null); setStudentSearch("");
    },
    onError: () => toast.error("Failed to allocate — room may be full or student already allocated"),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setBlockOpen(true)}>+ Add Block</Button>
        <Button variant="outline" onClick={() => setRoomOpen(true)}>+ Add Room</Button>
      </div>

      {!blocks?.length && <EmptyState title="No hostel blocks configured yet" />}
      {blocks?.map((b) => (
        <Card key={b.id}>
          <CardContent className="pt-6">
            <p className="mb-2 font-medium">{b.name} {b.type && <span className="text-sm text-muted-foreground">({b.type})</span>}</p>
            <div className="grid grid-cols-4 gap-3">
              {b.rooms.map((r) => (
                <div key={r.id} className="rounded-md border p-3 text-center">
                  <p className="font-medium">{r.room_no}</p>
                  <p className="text-sm text-muted-foreground">{r._count.allocations}/{r.capacity} beds</p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => { setAllocateRoomId(r.id); setAllocateOpen(true); }}>
                    Allocate
                  </Button>
                </div>
              ))}
              {!b.rooms.length && <p className="text-sm text-muted-foreground">No rooms yet</p>}
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Hostel Block</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={blockName} onChange={(e) => setBlockName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Type</Label><Input value={blockType} onChange={(e) => setBlockType(e.target.value)} placeholder="Boys / Girls" /></div>
          </div>
          <DialogFooter><Button disabled={!blockName || createBlockMutation.isPending} onClick={() => createBlockMutation.mutate()}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={roomOpen} onOpenChange={setRoomOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Room</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Block</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={roomBlockId} onChange={(e) => setRoomBlockId(e.target.value)}>
                <option value="">Select...</option>
                {blocks?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Room No</Label><Input value={roomNo} onChange={(e) => setRoomNo(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Capacity</Label><Input type="number" min={1} value={roomCapacity} onChange={(e) => setRoomCapacity(Number(e.target.value))} /></div>
          </div>
          <DialogFooter><Button disabled={!roomBlockId || !roomNo || createRoomMutation.isPending} onClick={() => createRoomMutation.mutate()}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={allocateOpen} onOpenChange={setAllocateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Allocate Room</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {selectedStudent ? (
              <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{selectedStudent.name_en} ({selectedStudent.student_uid})</span>
                <Button size="sm" variant="outline" onClick={() => setSelectedStudent(null)}>Change</Button>
              </div>
            ) : (
              <>
                <Input placeholder="Search student..." value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
                {students?.map((s) => (
                  <button key={s.id} onClick={() => setSelectedStudent(s)} className="block w-full rounded-md border p-2 text-left text-sm hover:bg-accent">
                    {s.name_en} <span className="font-mono text-xs text-muted-foreground">{s.student_uid}</span>
                  </button>
                ))}
              </>
            )}
          </div>
          <DialogFooter><Button disabled={!selectedStudent || allocateMutation.isPending} onClick={() => allocateMutation.mutate()}>Allocate</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {!!rooms && (
        <p className="text-xs text-muted-foreground">Total rooms: {rooms.length}</p>
      )}
    </div>
  );
}

function VisitorsTab() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);
  const [visitorName, setVisitorName] = useState("");
  const [relation, setRelation] = useState("");
  const [phone, setPhone] = useState("");

  const { data: visitors } = useQuery<Visitor[]>({ queryKey: ["hostel", "visitors"], queryFn: async () => (await api.get("/api/hostel/visitors")).data.data });

  const { data: students } = useQuery<StudentRow[]>({
    queryKey: ["students", "search", studentSearch],
    queryFn: async () => (await api.get("/api/students", { params: { search: studentSearch, limit: 5 } })).data.data,
    enabled: studentSearch.length > 1 && !selectedStudent,
  });

  const logInMutation = useMutation({
    mutationFn: () => api.post("/api/hostel/visitors", { student_id: selectedStudent!.id, visitor_name: visitorName, relation, phone }),
    onSuccess: () => {
      toast.success("Visitor logged in");
      queryClient.invalidateQueries({ queryKey: ["hostel", "visitors"] });
      setOpen(false);
      setSelectedStudent(null); setStudentSearch(""); setVisitorName(""); setRelation(""); setPhone("");
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/hostel/visitors/${id}/checkout`),
    onSuccess: () => {
      toast.success("Visitor checked out");
      queryClient.invalidateQueries({ queryKey: ["hostel", "visitors"] });
    },
  });

  return (
    <div className="space-y-4">
      <Button onClick={() => setOpen(true)}>+ Log Visitor In</Button>
      {!visitors?.length && <EmptyState title="No visitor records" />}
      {!!visitors?.length && (
        <Card>
          <CardContent className="pt-6">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Visitor</th><th className="p-2">Relation</th><th className="p-2">Phone</th><th className="p-2">In Time</th><th className="p-2">Status</th><th className="p-2">Actions</th></tr></thead>
              <tbody>
                {visitors.map((v) => (
                  <tr key={v.id} className="border-b">
                    <td className="p-2">{v.visitor_name}</td>
                    <td className="p-2">{v.relation}</td>
                    <td className="p-2">{v.phone}</td>
                    <td className="p-2">{new Date(v.in_time).toLocaleString()}</td>
                    <td className="p-2">{v.out_time ? <StatusBadge status="CHECKED_OUT" /> : <StatusBadge status="INSIDE" />}</td>
                    <td className="p-2">{!v.out_time && <Button size="sm" variant="outline" onClick={() => checkoutMutation.mutate(v.id)}>Check Out</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Visitor In</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Student (resident)</Label>
              {selectedStudent ? (
                <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <span>{selectedStudent.name_en}</span>
                  <Button size="sm" variant="outline" onClick={() => setSelectedStudent(null)}>Change</Button>
                </div>
              ) : (
                <>
                  <Input placeholder="Search student..." value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
                  {students?.map((s) => (
                    <button key={s.id} onClick={() => setSelectedStudent(s)} className="block w-full rounded-md border p-2 text-left text-sm hover:bg-accent">{s.name_en}</button>
                  ))}
                </>
              )}
            </div>
            <div className="space-y-1.5"><Label>Visitor Name</Label><Input value={visitorName} onChange={(e) => setVisitorName(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Relation</Label><Input value={relation} onChange={(e) => setRelation(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter><Button disabled={!selectedStudent || !visitorName || !relation || !phone || logInMutation.isPending} onClick={() => logInMutation.mutate()}>Log In</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OccupancyTab() {
  const { data } = useQuery<Occupancy>({ queryKey: ["hostel", "occupancy"], queryFn: async () => (await api.get("/api/hostel/reports/occupancy")).data.data });
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-semibold">{data.total_capacity}</p><p className="text-sm text-muted-foreground">Total Capacity</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-semibold">{data.total_occupied}</p><p className="text-sm text-muted-foreground">Occupied</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-2xl font-semibold">{data.fill_rate}%</p><p className="text-sm text-muted-foreground">Fill Rate</p></CardContent></Card>
      </div>
      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Block</th><th className="p-2">Room</th><th className="p-2">Occupied</th><th className="p-2">Capacity</th><th className="p-2">Fill %</th></tr></thead>
            <tbody>
              {data.rooms.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-2">{r.block_name}</td>
                  <td className="p-2">{r.room_no}</td>
                  <td className="p-2">{r.occupied}</td>
                  <td className="p-2">{r.capacity}</td>
                  <td className="p-2">{r.fill_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function HostelPage() {
  return (
    <PageWrapper>
      <PageHeader title="Hostel" breadcrumbs={[{ label: "Hostel" }]} />
      <Tabs defaultValue="rooms">
        <TabsList>
          <TabsTrigger value="rooms">Blocks &amp; Rooms</TabsTrigger>
          <TabsTrigger value="visitors">Visitor Log</TabsTrigger>
          <TabsTrigger value="occupancy">Occupancy Report</TabsTrigger>
        </TabsList>
        <TabsContent value="rooms"><RoomsTab /></TabsContent>
        <TabsContent value="visitors"><VisitorsTab /></TabsContent>
        <TabsContent value="occupancy"><OccupancyTab /></TabsContent>
      </Tabs>
    </PageWrapper>
  );
}

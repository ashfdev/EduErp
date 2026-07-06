"use client";

import { useQuery } from "@tanstack/react-query";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, LoadingSpinner } from "@education-erp/ui";

interface TransportHostel {
  transport: { route_name: string; fare: number; pickup_stop: string | null } | null;
  hostel: { block_name: string; room_no: string; bed_no: string | null; from_date: string } | null;
}

function TransportHostelContent() {
  const { activeStudentId } = useAuthStore();
  const { data, isLoading } = useQuery<TransportHostel>({
    queryKey: ["portal", "transport-hostel", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/transport-hostel`)).data.data,
    enabled: !!activeStudentId,
  });

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">Transport & Hostel</h1>

      <Card>
        <CardContent className="pt-6">
          <p className="mb-2 font-medium">Transport</p>
          {data?.transport ? (
            <div className="text-sm text-gray-700">
              <p>Route: {data.transport.route_name}</p>
              <p>Pickup Stop: {data.transport.pickup_stop ?? "N/A"}</p>
              <p>Fare: ৳{data.transport.fare}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">N/A</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <p className="mb-2 font-medium">Hostel</p>
          {data?.hostel ? (
            <div className="text-sm text-gray-700">
              <p>Block: {data.hostel.block_name}</p>
              <p>Room: {data.hostel.room_no} {data.hostel.bed_no && `· Bed ${data.hostel.bed_no}`}</p>
              <p>Since: {new Date(data.hostel.from_date).toLocaleDateString()}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">N/A</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function TransportHostelPage() {
  return (
    <PortalShell>
      <TransportHostelContent />
    </PortalShell>
  );
}

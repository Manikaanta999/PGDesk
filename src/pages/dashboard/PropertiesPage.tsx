import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BedDouble,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Layers,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/api';
import {
  buildBedStatusBreakdown,
  formatBedStatus,
  formatGenderType,
  formatTenantStatus,
} from '../../lib/dashboardHelpers';
import { formatDateIN, formatIndianPhone, formatINR } from '../../lib/format';

interface PropertyItem {
  id: number;
  name: string;
  slug: string;
  address: string;
  locality: string;
  city: string;
  genderType: 'BOYS' | 'GIRLS' | 'COED';
  billingMode: 'FIXED_1ST' | 'JOIN_DATE';
  billingDay: number;
  contactName: string;
  contactPhone: string;
  description: string;
  isPublic: boolean;
  stats: {
    totalRooms: number;
    totalBeds: number;
    occupiedBeds: number;
    vacantBeds: number;
    reservedBeds: number;
    maintenanceBeds: number;
  };
}

interface BedMapBed {
  id: number;
  roomId: number;
  bedLabel: string;
  status: 'VACANT' | 'OCCUPIED' | 'RESERVED' | 'MAINTENANCE';
  effectiveRent: number;
  monthlyRentOverride: number | null;
  notes: string | null;
  tenant: {
    id: number;
    name: string;
    phone: string | null;
    status: string;
    monthlyRent: number;
    joinDate: string;
    leaveDate: string | null;
  } | null;
}

interface BedMapRoom {
  id: number;
  roomNumber: string;
  roomType: 'SINGLE' | 'DOUBLE' | 'TRIPLE' | 'DORM';
  isAc: boolean;
  attachedBath: boolean;
  rentPerBed: number;
  beds: BedMapBed[];
}

interface BedMapFloor {
  id: number;
  name: string;
  floorNumber: number;
  rooms: BedMapRoom[];
}

const BED_STYLE: Record<BedMapBed['status'], { box: string; label: string }> = {
  VACANT: {
    box: 'border-emerald-300 bg-emerald-50/70 text-emerald-950 hover:border-emerald-500 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
    label: 'Vacant',
  },
  OCCUPIED: {
    box: 'border-slate-300 bg-slate-100 text-slate-900 hover:border-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
    label: 'Occupied',
  },
  RESERVED: {
    box: 'border-amber-300 bg-amber-50/80 text-amber-950 hover:border-amber-500 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
    label: 'Reserved',
  },
  MAINTENANCE: {
    box: 'border-red-300 bg-red-50/80 text-red-950 hover:border-red-500 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200',
    label: 'Maintenance',
  },
};

export function PropertiesPage() {
  const { user } = useAuth();
  const { tHeading } = useLanguage();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [activePropId, setActivePropId] = useState<number | null>(null);
  const [floors, setFloors] = useState<BedMapFloor[]>([]);
  const [collapsedFloors, setCollapsedFloors] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [selectedBed, setSelectedBed] = useState<{ bed: BedMapBed; room: BedMapRoom } | null>(null);
  const [bedNotesDraft, setBedNotesDraft] = useState('');

  // Create Hostel Modal
  const [showAddProp, setShowAddProp] = useState(false);
  const [propForm, setPropForm] = useState({
    name: '',
    address: '',
    locality: '',
    city: 'Guntur',
    genderType: 'BOYS' as 'BOYS' | 'GIRLS' | 'COED',
    contactName: '',
    contactPhone: '',
    billingMode: 'FIXED_1ST' as 'FIXED_1ST' | 'JOIN_DATE',
    billingDay: 1,
    description: '',
  });

  // Edit Hostel Modal
  const [editingProp, setEditingProp] = useState<PropertyItem | null>(null);
  const [editPropForm, setEditPropForm] = useState({
    name: '',
    address: '',
    locality: '',
    city: '',
    genderType: 'BOYS' as 'BOYS' | 'GIRLS' | 'COED',
    contactName: '',
    contactPhone: '',
    billingMode: 'FIXED_1ST' as 'FIXED_1ST' | 'JOIN_DATE',
    billingDay: 1,
    isPublic: true,
    description: '',
  });
  const [savingPropEdit, setSavingPropEdit] = useState(false);

  // Add Floor & Add Room Modals
  const [showAddFloor, setShowAddFloor] = useState(false);
  const [floorForm, setFloorForm] = useState({ name: '', floorNumber: 1 });

  const [showAddRoom, setShowAddRoom] = useState(false);
  const [roomForm, setRoomForm] = useState({
    floorId: 0,
    roomNumber: '',
    roomType: 'DOUBLE' as 'SINGLE' | 'DOUBLE' | 'TRIPLE' | 'DORM',
    isAc: true,
    attachedBath: true,
    rentPerBed: 7500,
    bedCount: 2,
  });

  // Add Beds to Existing Room Modal
  const [addBedsRoom, setAddBedsRoom] = useState<BedMapRoom | null>(null);
  const [addBedsCount, setAddBedsCount] = useState(1);
  const [addingBeds, setAddingBeds] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PropertyItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadProperties = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ properties: PropertyItem[] }>('/api/properties');
      setProperties(res.properties);
      if (res.properties.length > 0 && !activePropId) {
        setActivePropId(res.properties[0].id);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load hostels', 'error');
    } finally {
      setLoading(false);
    }
  }, [activePropId, showToast]);

  const loadBedMap = useCallback(async (propId: number) => {
    try {
      const res = await apiFetch<{ floors: BedMapFloor[] }>(`/api/properties/${propId}/bed-map`);
      setFloors(res.floors);
      if (res.floors.length > 0) {
        setRoomForm((rf) => ({ ...rf, floorId: rf.floorId || res.floors[0].id }));
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load rooms and beds', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  useEffect(() => {
    if (activePropId) {
      loadBedMap(activePropId);
    }
  }, [activePropId, loadBedMap]);

  useEffect(() => {
    if (searchParams.get('tab') === 'rooms' && !loading) {
      const el = document.getElementById('bed-map');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [searchParams, loading, activePropId]);

  const activeProperty = properties.find((p) => p.id === activePropId) || null;

  const openEditProperty = (p: PropertyItem) => {
    setEditingProp(p);
    setEditPropForm({
      name: p.name,
      address: p.address,
      locality: p.locality,
      city: p.city,
      genderType: p.genderType,
      contactName: p.contactName,
      contactPhone: p.contactPhone,
      billingMode: p.billingMode,
      billingDay: p.billingDay,
      isPublic: p.isPublic,
      description: p.description || '',
    });
  };

  const handleSavePropertyEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProp || savingPropEdit) return;
    setSavingPropEdit(true);
    try {
      await apiFetch(`/api/properties/${editingProp.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editPropForm),
      });
      showToast(`Updated "${editPropForm.name}"`);
      setEditingProp(null);
      await loadProperties();
    } catch (err: any) {
      showToast(err.message || 'Failed to update hostel', 'error');
    } finally {
      setSavingPropEdit(false);
    }
  };

  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ property: PropertyItem }>('/api/properties', {
        method: 'POST',
        body: JSON.stringify({
          ...propForm,
          amenities: ['High-Speed Wi-Fi', 'Housekeeping', 'CCTV Security', 'Power Backup'],
          rules: ['30-day prior move-out notice required.'],
        }),
      });
      showToast(`Hostel "${res.property.name}" created`);
      setShowAddProp(false);
      setActivePropId(res.property.id);
      await loadProperties();
    } catch (err: any) {
      showToast(err.message || 'Failed to create hostel', 'error');
    }
  };

  const handleAddFloor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePropId) return;
    try {
      await apiFetch(`/api/properties/${activePropId}/floors`, {
        method: 'POST',
        body: JSON.stringify(floorForm),
      });
      showToast('Floor added');
      setShowAddFloor(false);
      await loadBedMap(activePropId);
    } catch (err: any) {
      showToast(err.message || 'Failed to add floor', 'error');
    }
  };

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePropId) return;
    try {
      await apiFetch(`/api/properties/${activePropId}/rooms`, {
        method: 'POST',
        body: JSON.stringify(roomForm),
      });
      showToast(`Room ${roomForm.roomNumber} and beds added`);
      setShowAddRoom(false);
      await Promise.all([loadBedMap(activePropId), loadProperties()]);
    } catch (err: any) {
      showToast(err.message || 'Failed to add room', 'error');
    }
  };

  const handleAddBedsToRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addBedsRoom || !activePropId || addingBeds) return;
    setAddingBeds(true);
    try {
      await apiFetch(`/api/properties/rooms/${addBedsRoom.id}/beds`, {
        method: 'POST',
        body: JSON.stringify({ count: addBedsCount }),
      });
      showToast(`Added ${addBedsCount} ${addBedsCount === 1 ? 'bed' : 'beds'} to Room ${addBedsRoom.roomNumber}`);
      setAddBedsRoom(null);
      setAddBedsCount(1);
      await Promise.all([loadBedMap(activePropId), loadProperties()]);
    } catch (err: any) {
      showToast(err.message || 'Failed to add beds', 'error');
    } finally {
      setAddingBeds(false);
    }
  };

  const handleBedStatusChange = async (bedId: number, status: BedMapBed['status']) => {
    if (!activePropId) return;
    try {
      await apiFetch(`/api/properties/beds/${bedId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, notes: bedNotesDraft || null }),
      });
      showToast(`Bed updated to ${formatBedStatus(status)}`);
      setSelectedBed(null);
      await Promise.all([loadBedMap(activePropId), loadProperties()]);
    } catch (err: any) {
      showToast(err.message || 'Failed to update bed status', 'error');
    }
  };

  const handleDeleteProperty = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/properties/${deleteTarget.id}`, { method: 'DELETE' });
      showToast(`Hostel "${deleteTarget.name}" archived`);
      setDeleteTarget(null);
      setActivePropId(null);
      await loadProperties();
    } catch (err: any) {
      showToast(err.message || 'Could not delete hostel', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const toggleFloorCollapse = (floorId: number) => {
    setCollapsedFloors((prev) => ({ ...prev, [floorId]: !prev[floorId] }));
  };

  return (
    <DashboardLayout
      title={tHeading('heading.pageRooms')}
      breadcrumb="Home / My Hostels & Rooms"
      actions={
        user?.role === 'OWNER' ? (
          <button
            type="button"
            onClick={() => setShowAddProp(true)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Hostel</span>
          </button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {/* Hostel Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {loading
            ? [1, 2].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
              ))
            : properties.map((p) => {
                const selected = p.id === activePropId;
                const breakdown = buildBedStatusBreakdown(p.stats);
                return (
                  <div
                    key={p.id}
                    className={`flex flex-col justify-between rounded-xl border p-5 transition-colors ${
                      selected
                        ? 'border-teal-700 bg-white dark:border-teal-500 dark:bg-slate-900'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setActivePropId(p.id)}
                        className="min-w-0 flex-1 text-left focus:outline-none"
                      >
                        <p className="font-display text-base font-bold text-slate-900 dark:text-white">
                          {p.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {p.locality}, {p.city} · {formatGenderType(p.genderType)} ·{' '}
                          {p.billingMode === 'FIXED_1ST' ? '1st Monthly Rent' : 'Join-Date Cycle'}
                        </p>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditProperty(p)}
                          aria-label={`Edit hostel ${p.name}`}
                          title="Edit Hostel"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-700 dark:hover:bg-slate-800"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {p.isPublic && (
                          <Link
                            to={`/pg/${p.slug}`}
                            target="_blank"
                            aria-label={`Open public listing for ${p.name}`}
                            title="Open public page"
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-700 dark:hover:bg-slate-800"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        )}
                        {user?.role === 'OWNER' && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(p)}
                            aria-label={`Archive ${p.name}`}
                            title="Archive Hostel"
                            className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-4 gap-2 border-t border-slate-100 pt-3 text-center tabular-nums dark:border-slate-800">
                      <div>
                        <p className="text-[11px] text-slate-500">Rooms</p>
                        <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                          {p.stats.totalRooms}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500">Total Beds</p>
                        <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                          {p.stats.totalBeds}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500">Occupied</p>
                        <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                          {p.stats.occupiedBeds}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500">Empty</p>
                        <p className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400">
                          {p.stats.vacantBeds}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      {breakdown.summaryText}
                    </p>
                  </div>
                );
              })}
        </div>

        {/* Active Hostel Rooms & Bed-Map */}
        {activeProperty && (
          <div
            id="bed-map"
            className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center dark:border-slate-800">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  {activeProperty.name} — {tHeading('heading.sectionBedMap')}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Tap any bed to check student details, assign a new student, or mark a bed for maintenance.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditProperty(activeProperty)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Edit Hostel</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFloorForm({ name: `Floor ${floors.length + 1}`, floorNumber: floors.length + 1 });
                    setShowAddFloor(true);
                  }}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>Add Floor</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (floors[0]) setRoomForm((rf) => ({ ...rf, floorId: floors[0].id }));
                    setShowAddRoom(true);
                  }}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-teal-700 dark:hover:bg-teal-800"
                >
                  <BedDouble className="h-3.5 w-3.5" />
                  <span>Add Room &amp; Beds</span>
                </button>
              </div>
            </div>

            {/* Color + Text Legend */}
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-emerald-400 bg-emerald-100 dark:bg-emerald-950" />
                Vacant (Ready to Assign)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-slate-400 bg-slate-200 dark:bg-slate-700" />
                Occupied
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-amber-400 bg-amber-100 dark:bg-amber-950" />
                Reserved
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-red-400 bg-red-100 dark:bg-red-950" />
                Maintenance
              </span>
            </div>

            {/* Collapsible Floors & Rooms Grid */}
            <div className="mt-6 space-y-6">
              {floors.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  No floors added yet. Click &quot;Add Floor&quot; to begin mapping rooms.
                </p>
              ) : (
                floors.map((floor) => {
                  const isCollapsed = Boolean(collapsedFloors[floor.id]);
                  const totalFloorBeds = floor.rooms.reduce((s, r) => s + r.beds.length, 0);
                  const vacantFloorBeds = floor.rooms.reduce(
                    (s, r) => s + r.beds.filter((b) => b.status === 'VACANT').length,
                    0
                  );
                  return (
                    <div
                      key={floor.id}
                      className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 dark:border-slate-800 dark:bg-slate-950/30"
                    >
                      <button
                        type="button"
                        aria-expanded={!isCollapsed}
                        onClick={() => toggleFloorCollapse(floor.id)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                      >
                        <div className="flex items-center gap-2">
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4 text-slate-500" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-500" />
                          )}
                          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                            {floor.name}
                          </h3>
                        </div>
                        <span className="text-xs font-medium text-slate-500 tabular-nums dark:text-slate-400">
                          {floor.rooms.length} {floor.rooms.length === 1 ? 'room' : 'rooms'} · {vacantFloorBeds} empty of {totalFloorBeds} beds
                        </span>
                      </button>

                      {!isCollapsed && (
                        <div className="mt-4">
                          {floor.rooms.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-800">
                              No rooms on this floor yet.
                            </p>
                          ) : (
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                              {floor.rooms.map((room) => (
                                <div
                                  key={room.id}
                                  className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                                >
                                  <div className="flex items-start justify-between gap-2 pb-3">
                                    <div>
                                      <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                                        Room {room.roomNumber}
                                      </p>
                                      <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {room.roomType} · {room.isAc ? 'AC' : 'Non-AC'} · {formatINR(room.rentPerBed)} · {room.beds.length} beds
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAddBedsRoom(room);
                                        setAddBedsCount(1);
                                      }}
                                      aria-label={`Add beds to Room ${room.roomNumber}`}
                                      title="Add beds to this room"
                                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                      <Plus className="h-3 w-3" />
                                      <span>Add Beds</span>
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-1 gap-2">
                                    {room.beds.map((bed) => {
                                      const st = BED_STYLE[bed.status];
                                      return (
                                        <button
                                          key={bed.id}
                                          type="button"
                                          onClick={() => {
                                            setBedNotesDraft(bed.notes || '');
                                            setSelectedBed({ bed, room });
                                          }}
                                          className={`flex min-h-[44px] items-center justify-between rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${st.box}`}
                                        >
                                          <div className="min-w-0">
                                            <p className="font-mono font-semibold">{bed.bedLabel}</p>
                                            <p className="truncate opacity-85">
                                              {bed.tenant
                                                ? bed.tenant.name
                                                : bed.status === 'VACANT'
                                                  ? 'Ready to assign'
                                                  : st.label}
                                            </p>
                                          </div>
                                          <span
                                            className={`shrink-0 font-mono text-[11px] font-semibold ${
                                              bed.tenant?.status === 'NOTICE'
                                                ? 'text-amber-700 dark:text-amber-400'
                                                : ''
                                            }`}
                                          >
                                            {bed.tenant?.status === 'NOTICE' ? 'On Notice' : st.label}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bed Detail Panel Modal */}
      {selectedBed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  Bed {selectedBed.bed.bedLabel} · Room {selectedBed.room.roomNumber}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedBed.room.roomType} · {selectedBed.room.isAc ? 'AC' : 'Non-AC'} ·{' '}
                  {formatINR(selectedBed.bed.effectiveRent)}/month
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBed(null)}
                aria-label="Close bed details"
                title="Close"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {selectedBed.bed.tenant ? (
              <div className="mt-5 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {selectedBed.bed.tenant.name}
                  </p>
                  <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                    {formatTenantStatus(selectedBed.bed.tenant.status)}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Phone: {formatIndianPhone(selectedBed.bed.tenant.phone)} · Rent:{' '}
                  {formatINR(selectedBed.bed.tenant.monthlyRent)}/mo
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Joined: {formatDateIN(selectedBed.bed.tenant.joinDate)}
                </p>
                <div className="grid gap-2 pt-2 sm:grid-cols-2">
                  <Link
                    to={`/dashboard/tenants/${selectedBed.bed.tenant.id}`}
                    className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                  >
                    View Student Details
                  </Link>
                  <Link
                    to={`/dashboard/tenants/${selectedBed.bed.tenant.id}?moveOut=1`}
                    className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    Release Bed (Move Out)
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Current Status:{' '}
                  <span className="font-semibold">{formatBedStatus(selectedBed.bed.status)}</span>
                </p>

                {(selectedBed.bed.status === 'VACANT' || selectedBed.bed.status === 'RESERVED') && (
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/dashboard/tenants?new=1&propertyId=${activePropId}&bedId=${selectedBed.bed.id}&rent=${selectedBed.bed.effectiveRent}`
                      )
                    }
                    className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span>Assign Student to {selectedBed.bed.bedLabel}</span>
                  </button>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Bed Note (Optional)
                  </label>
                  <input
                    value={bedNotesDraft}
                    onChange={(e) => setBedNotesDraft(e.target.value)}
                    placeholder="e.g., Fan repair in progress / Reserved for Ravi"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-slate-500">Change Bed Status</p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleBedStatusChange(selectedBed.bed.id, 'VACANT')}
                      disabled={selectedBed.bed.status === 'VACANT'}
                      className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Mark Vacant
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBedStatusChange(selectedBed.bed.id, 'RESERVED')}
                      disabled={selectedBed.bed.status === 'RESERVED'}
                      className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Reserved
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBedStatusChange(selectedBed.bed.id, 'MAINTENANCE')}
                      disabled={selectedBed.bed.status === 'MAINTENANCE'}
                      className="rounded-lg border border-red-200 px-2.5 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      Maintenance
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Hostel Modal */}
      {editingProp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleSavePropertyEdit}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between pb-4">
              <h3 className="font-display text-lg font-semibold">Edit Hostel Details</h3>
              <button type="button" onClick={() => setEditingProp(null)} aria-label="Close edit hostel modal">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium">Hostel Name *</label>
                <input
                  required
                  value={editPropForm.name}
                  onChange={(e) => setEditPropForm({ ...editPropForm, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium">Street Address *</label>
                <input
                  required
                  value={editPropForm.address}
                  onChange={(e) => setEditPropForm({ ...editPropForm, address: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Locality / Area *</label>
                <input
                  required
                  value={editPropForm.locality}
                  onChange={(e) => setEditPropForm({ ...editPropForm, locality: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">City *</label>
                <input
                  required
                  value={editPropForm.city}
                  onChange={(e) => setEditPropForm({ ...editPropForm, city: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Hostel Category</label>
                <select
                  value={editPropForm.genderType}
                  onChange={(e) => setEditPropForm({ ...editPropForm, genderType: e.target.value as any })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="BOYS">Boys</option>
                  <option value="GIRLS">Girls</option>
                  <option value="COED">Co-Ed</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium">Monthly Rent Cycle</label>
                <select
                  value={editPropForm.billingMode}
                  onChange={(e) => setEditPropForm({ ...editPropForm, billingMode: e.target.value as any })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="FIXED_1ST">1st of Every Month</option>
                  <option value="JOIN_DATE">Student Join Date</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium">Warden / Contact Name *</label>
                <input
                  required
                  value={editPropForm.contactName}
                  onChange={(e) => setEditPropForm({ ...editPropForm, contactName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Contact Mobile *</label>
                <input
                  required
                  value={editPropForm.contactPhone}
                  onChange={(e) => setEditPropForm({ ...editPropForm, contactPhone: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <label className="sm:col-span-2 flex items-center gap-2 pt-1 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={editPropForm.isPublic}
                  onChange={(e) => setEditPropForm({ ...editPropForm, isPublic: e.target.checked })}
                />
                <span>Show hostel on PGDesk public enquiry page</span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingProp(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPropEdit}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {savingPropEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Beds to Existing Room Modal */}
      {addBedsRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleAddBedsToRoom}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between pb-3">
              <h3 className="font-display text-lg font-semibold">Add Beds to Room {addBedsRoom.roomNumber}</h3>
              <button type="button" onClick={() => setAddBedsRoom(null)} aria-label="Close modal">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Currently {addBedsRoom.beds.length} beds in this room. New beds will be marked Vacant automatically.
            </p>
            <div className="mt-4">
              <label className="block text-xs font-medium">Number of Beds to Add (1–8)</label>
              <input
                type="number"
                required
                min={1}
                max={8}
                value={addBedsCount}
                onChange={(e) => setAddBedsCount(Math.max(1, Math.min(8, Number(e.target.value))))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddBedsRoom(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addingBeds}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {addingBeds ? 'Adding...' : 'Add Beds'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Hostel Modal */}
      {showAddProp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleCreateProperty}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between pb-4">
              <h3 className="font-display text-lg font-semibold">Add New Hostel</h3>
              <button type="button" onClick={() => setShowAddProp(false)} aria-label="Close modal">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium">Hostel Name *</label>
                <input
                  required
                  value={propForm.name}
                  onChange={(e) => setPropForm({ ...propForm, name: e.target.value })}
                  placeholder="e.g., Sri Sai Boys Hostel"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium">Street Address *</label>
                <input
                  required
                  value={propForm.address}
                  onChange={(e) => setPropForm({ ...propForm, address: e.target.value })}
                  placeholder="4th Lane, Arundelpet"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Area / Locality *</label>
                <input
                  required
                  value={propForm.locality}
                  onChange={(e) => setPropForm({ ...propForm, locality: e.target.value })}
                  placeholder="e.g., Brodipet"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">City *</label>
                <input
                  required
                  value={propForm.city}
                  onChange={(e) => setPropForm({ ...propForm, city: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Hostel Category</label>
                <select
                  value={propForm.genderType}
                  onChange={(e) => setPropForm({ ...propForm, genderType: e.target.value as any })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="BOYS">Boys</option>
                  <option value="GIRLS">Girls</option>
                  <option value="COED">Co-Ed</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium">Rent Cycle</label>
                <select
                  value={propForm.billingMode}
                  onChange={(e) => setPropForm({ ...propForm, billingMode: e.target.value as any })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="FIXED_1ST">1st of Every Month</option>
                  <option value="JOIN_DATE">Student Join-Date Cycle</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium">Warden / Contact Name *</label>
                <input
                  required
                  value={propForm.contactName}
                  onChange={(e) => setPropForm({ ...propForm, contactName: e.target.value })}
                  placeholder="Manager full name"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Contact Mobile *</label>
                <input
                  required
                  value={propForm.contactPhone}
                  onChange={(e) => setPropForm({ ...propForm, contactPhone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddProp(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
              >
                Create Hostel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Floor Modal */}
      {showAddFloor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleAddFloor}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <h3 className="font-display text-lg font-semibold">Add Floor</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium">Floor Name</label>
                <input
                  required
                  value={floorForm.name}
                  onChange={(e) => setFloorForm({ ...floorForm, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Floor Number</label>
                <input
                  type="number"
                  required
                  value={floorForm.floorNumber}
                  onChange={(e) => setFloorForm({ ...floorForm, floorNumber: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddFloor(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white">
                Add Floor
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Room Modal */}
      {showAddRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleAddRoom}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <h3 className="font-display text-lg font-semibold">Add Room &amp; Auto-Create Beds</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium">Floor</label>
                <select
                  value={roomForm.floorId}
                  onChange={(e) => setRoomForm({ ...roomForm, floorId: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  {floors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium">Room Number</label>
                <input
                  required
                  placeholder="e.g., 401"
                  value={roomForm.roomNumber}
                  onChange={(e) => setRoomForm({ ...roomForm, roomNumber: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Sharing Type</label>
                <select
                  value={roomForm.roomType}
                  onChange={(e) => {
                    const rt = e.target.value as any;
                    const count = rt === 'SINGLE' ? 1 : rt === 'DOUBLE' ? 2 : rt === 'TRIPLE' ? 3 : 4;
                    setRoomForm({ ...roomForm, roomType: rt, bedCount: count });
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="SINGLE">Single</option>
                  <option value="DOUBLE">Double</option>
                  <option value="TRIPLE">Triple</option>
                  <option value="DORM">Dorm</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium">Monthly Rent / Bed (₹)</label>
                <input
                  type="number"
                  required
                  value={roomForm.rentPerBed}
                  onChange={(e) => setRoomForm({ ...roomForm, rentPerBed: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={roomForm.isAc}
                  onChange={(e) => setRoomForm({ ...roomForm, isAc: e.target.checked })}
                />
                <span>Air Conditioned (AC)</span>
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={roomForm.attachedBath}
                  onChange={(e) => setRoomForm({ ...roomForm, attachedBath: e.target.checked })}
                />
                <span>Attached Bathroom</span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddRoom(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white">
                Create Room &amp; {roomForm.bedCount} Beds
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Archive "${deleteTarget?.name}"?`}
        description="This hostel will be removed from active operations and public listings. Hostels with active students cannot be archived."
        confirmLabel="Archive Hostel"
        destructive
        loading={deleting}
        onConfirm={handleDeleteProperty}
        onCancel={() => setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}

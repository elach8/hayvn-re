'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function NewPropertyPage() {
  const router = useRouter();

  // Basic fields
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Irvine');
  const [state, setState] = useState('CA');
  const [zip, setZip] = useState('');
  const [listPrice, setListPrice] = useState('');
  const [propertyType, setPropertyType] = useState('industrial');
  const [pipelineStage, setPipelineStage] = useState('watching');

  // MLS-related
  const [mlsId, setMlsId] = useState('');
  const [mlsUrl, setMlsUrl] = useState('');

  // Commercial / industrial fields
  const [apn, setApn] = useState('');
  const [zoning, setZoning] = useState('');
  const [numUnits, setNumUnits] = useState('');
  const [occupancyPct, setOccupancyPct] = useState('');
  const [noiAnnual, setNoiAnnual] = useState('');
  const [capRate, setCapRate] = useState('');
  const [parkingSpaces, setParkingSpaces] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toNumberOrNull = (raw: string) => {
    const cleaned = raw.replace(/,/g, '').trim();
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isNaN(num) ? null : num;
  };

  const toIntOrNull = (raw: string) => {
    const cleaned = raw.trim();
    if (!cleaned) return null;
    const num = parseInt(cleaned, 10);
    return Number.isNaN(num) ? null : num;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim() || !city.trim() || !state.trim() || !zip.trim()) {
      setError('Address, city, state, and zip are required.');
      return;
    }

    setSaving(true);
    setError(null);

    const { error } = await supabase.from('properties').insert([
      {
        address: address.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
        zip: zip.trim(),

        list_price: toNumberOrNull(listPrice),
        property_type: propertyType || null,
        pipeline_stage: pipelineStage,

        // MLS stuff
        mls_id: mlsId.trim() || null,
        mls_url: mlsUrl.trim() || null,

        // Commercial / industrial
        apn: apn.trim() || null,
        zoning: zoning.trim() || null,
        num_units: toIntOrNull(numUnits),
        occupancy_pct: toNumberOrNull(occupancyPct),
        noi_annual: toNumberOrNull(noiAnnual),
        cap_rate: toNumberOrNull(capRate),
        parking_spaces: toIntOrNull(parkingSpaces),
      },
    ]);

    if (error) {
      console.error('Error inserting property:', error);
      setError(error.message);
      setSaving(false);
      return;
    }

    router.push('/properties');
  };

  const inputClass =
    'w-full rounded-md border border-white/15 bg-black/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500';
  const labelClass = 'block text-xs font-medium text-slate-300 mb-1';

  return (
    <main className="min-h-screen max-w-3xl text-slate-100">
      <header className="flex items-center justify-between mb-5 gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Add Property
          </h1>
          <p className="text-sm text-slate-300 mt-1">
            Quick entry for a new deal to track. MLS data can attach later.
          </p>
        </div>

        <Link
          href="/properties"
          className="text-xs sm:text-sm text-slate-300 hover:text-slate-50 hover:underline"
        >
          ← Back to Properties
        </Link>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <p className="text-sm text-red-100 bg-red-500/20 border border-red-500/40 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Basic address block */}
        <section className="border border-white/10 rounded-xl bg-black/40 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">
              Address & basics
            </h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-slate-300 border border-white/10">
              Required
            </span>
          </div>

          <div>
            <label className={labelClass}>Address *</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputClass}
              placeholder="123 Main St"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>City *</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>State *</label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase())}
                className={inputClass}
                maxLength={2}
              />
            </div>
            <div>
              <label className={labelClass}>Zip *</label>
              <input
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>List price</label>
              <input
                type="text"
                value={listPrice}
                onChange={(e) => setListPrice(e.target.value)}
                className={inputClass}
                placeholder="1500000"
              />
            </div>

            <div>
              <label className={labelClass}>Pipeline stage</label>
              <select
                value={pipelineStage}
                onChange={(e) => setPipelineStage(e.target.value)}
                className={inputClass}
              >
                <option value="watching">Watching</option>
                <option value="called">Called</option>
                <option value="offered">Offered</option>
                <option value="under_contract">Under Contract</option>
                <option value="closed">Closed</option>
                <option value="dead">Dead</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Property type</label>
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              className={inputClass}
            >
              <option value="industrial">Industrial</option>
              <option value="commercial">Commercial</option>
              <option value="retail">Retail</option>
              <option value="office">Office</option>
              <option value="multi-family">Multi-family</option>
              <option value="SFH">Single Family</option>
              <option value="condo">Condo</option>
              <option value="">Other / Unknown</option>
            </select>
          </div>
        </section>

        {/* MLS block */}
        <section className="border border-white/10 rounded-xl bg-black/40 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">
              MLS info
            </h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/10">
              Optional
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>MLS ID</label>
              <input
                type="text"
                value={mlsId}
                onChange={(e) => setMlsId(e.target.value)}
                className={inputClass}
                placeholder="CRMLS ID"
              />
            </div>
            <div>
              <label className={labelClass}>MLS URL</label>
              <input
                type="text"
                value={mlsUrl}
                onChange={(e) => setMlsUrl(e.target.value)}
                className={inputClass}
                placeholder="Full link to MLS listing"
              />
            </div>
          </div>
        </section>

        {/* Commercial / industrial metrics */}
        <section className="border border-white/10 rounded-xl bg-black/40 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">
              Commercial / industrial metrics
            </h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/10">
              Optional
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>APN</label>
              <input
                type="text"
                value={apn}
                onChange={(e) => setApn(e.target.value)}
                className={inputClass}
                placeholder="Assessor Parcel Number"
              />
            </div>
            <div>
              <label className={labelClass}>Zoning</label>
              <input
                type="text"
                value={zoning}
                onChange={(e) => setZoning(e.target.value)}
                className={inputClass}
                placeholder="M1, C2, etc."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}># of units</label>
              <input
                type="text"
                value={numUnits}
                onChange={(e) => setNumUnits(e.target.value)}
                className={inputClass}
                placeholder="e.g., 4"
              />
            </div>
            <div>
              <label className={labelClass}>Occupancy %</label>
              <input
                type="text"
                value={occupancyPct}
                onChange={(e) => setOccupancyPct(e.target.value)}
                className={inputClass}
                placeholder="e.g., 90"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>NOI (annual)</label>
              <input
                type="text"
                value={noiAnnual}
                onChange={(e) => setNoiAnnual(e.target.value)}
                className={inputClass}
                placeholder="e.g., 250000"
              />
            </div>
            <div>
              <label className={labelClass}>Cap rate (%)</label>
              <input
                type="text"
                value={capRate}
                onChange={(e) => setCapRate(e.target.value)}
                className={inputClass}
                placeholder="e.g., 6.5"
              />
            </div>
            <div>
              <label className={labelClass}>Parking spaces</label>
              <input
                type="text"
                value={parkingSpaces}
                onChange={(e) => setParkingSpaces(e.target.value)}
                className={inputClass}
                placeholder="e.g., 42"
              />
            </div>
          </div>
        </section>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center rounded-lg bg-[#EBD27A] px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-[#f0dc96] disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save property'}
        </button>
      </form>
    </main>
  );
}

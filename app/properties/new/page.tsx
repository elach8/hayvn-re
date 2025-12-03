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

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-4 gap-2">
        <div>
          <h1 className="text-2xl font-bold">Add Property</h1>
          <p className="text-sm text-gray-600">
            Quick entry for a new deal to track.
          </p>
        </div>

        <Link
          href="/properties"
          className="text-sm text-gray-600 hover:underline"
        >
          ← Back to Properties
        </Link>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Basic address block */}
        <section className="border border-gray-200 rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">
            Address & Basics
          </h2>

          <div>
            <label className="block text-sm font-medium mb-1">
              Address *
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="123 Main St"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                City *
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                State *
              </label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase())}
                className="w-full border rounded-md px-3 py-2 text-sm"
                maxLength={2}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Zip *
              </label>
              <input
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                List Price
              </label>
              <input
                type="text"
                value={listPrice}
                onChange={(e) => setListPrice(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="1500000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Pipeline Stage
              </label>
              <select
                value={pipelineStage}
                onChange={(e) => setPipelineStage(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
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
            <label className="block text-sm font-medium mb-1">
              Property Type
            </label>
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
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
        <section className="border border-gray-200 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">
            MLS Info (optional)
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                MLS ID
              </label>
              <input
                type="text"
                value={mlsId}
                onChange={(e) => setMlsId(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="CRMLS ID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                MLS URL
              </label>
              <input
                type="text"
                value={mlsUrl}
                onChange={(e) => setMlsUrl(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="Full link to MLS listing"
              />
            </div>
          </div>
        </section>

        {/* Commercial / industrial metrics */}
        <section className="border border-gray-200 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">
            Commercial / Industrial (optional)
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                APN
              </label>
              <input
                type="text"
                value={apn}
                onChange={(e) => setApn(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="Assessor Parcel Number"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Zoning
              </label>
              <input
                type="text"
                value={zoning}
                onChange={(e) => setZoning(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="M1, C2, etc."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                # of Units
              </label>
              <input
                type="text"
                value={numUnits}
                onChange={(e) => setNumUnits(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="e.g., 4"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Occupancy %
              </label>
              <input
                type="text"
                value={occupancyPct}
                onChange={(e) => setOccupancyPct(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="e.g., 90"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                NOI (Annual)
              </label>
              <input
                type="text"
                value={noiAnnual}
                onChange={(e) => setNoiAnnual(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="e.g., 250000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Cap Rate (%)
              </label>
              <input
                type="text"
                value={capRate}
                onChange={(e) => setCapRate(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="e.g., 6.5"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Parking Spaces
              </label>
              <input
                type="text"
                value={parkingSpaces}
                onChange={(e) => setParkingSpaces(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="e.g., 42"
              />
            </div>
          </div>
        </section>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center px-4 py-2 rounded-md bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save Property'}
        </button>
      </form>
    </main>
  );
}

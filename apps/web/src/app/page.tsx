import { FavouritesPanel } from '@/components/FavouritesPanel';
import { NearbyStops } from '@/components/NearbyStops';
import { StopSearch } from '@/components/StopSearch';

export default function HomePage() {
  return (
    <>
      <h1>When’s my bus?</h1>
      <p className="lede">Live arrival times for every bus stop in Singapore.</p>
      <FavouritesPanel />
      <NearbyStops />
      <StopSearch />
    </>
  );
}

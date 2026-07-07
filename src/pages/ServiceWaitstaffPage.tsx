import ServiceHeader from '@/components/service/ServiceHeader';
import WaitstaffBoard from '@/components/service/WaitstaffBoard';

const ServiceWaitstaffPage = () => (
  <div className="min-h-screen flex flex-col bg-navy-texture">
    <ServiceHeader department="waitstaff" />
    <div className="flex-1 overflow-y-auto">
      <div className="pb-20">
        <WaitstaffBoard />
      </div>
    </div>
  </div>
);

export default ServiceWaitstaffPage;

import ServiceHeader from '@/components/service/ServiceHeader';
import ReceptionPage from '@/pages/ReceptionPage';
import MorningBriefing from '@/components/MorningBriefing';

const ServiceReceptionPage = () => (
  <div className="h-screen flex flex-col bg-navy-texture">
    <ServiceHeader department="reception" />
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 pt-4">
        <MorningBriefing />
      </div>
      <div className="pb-20">
        <ReceptionPage embedded />
      </div>
    </div>
  </div>
);

export default ServiceReceptionPage;

import ServiceHeader from '@/components/service/ServiceHeader';
import ToursBoard from '@/components/service/ToursBoard';

const ServiceToursPage = () => (
  <div className="h-screen flex flex-col bg-navy-texture overflow-hidden">
    <ServiceHeader department="tours" />
    <ToursBoard />
  </div>
);

export default ServiceToursPage;

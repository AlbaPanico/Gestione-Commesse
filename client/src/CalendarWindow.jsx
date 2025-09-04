// CalendarSlide.jsx
import React from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

export default function CalendarSlide({ deliveryDates, tileClassName }) {
  return (
    <div className="fixed top-4 right-4 w-1/4 h-screen">
      <div className="bg-white shadow-md p-4 overflow-y-auto h-full">
        <h2 className="text-lg font-bold mb-2">Calendario</h2>
        <Calendar tileClassName={tileClassName} />
      </div>
    </div>
  );
}

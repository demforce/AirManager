import { describe, expect, it } from 'vitest';
import { flightPicPerson } from './flight-pic';

const PERSON = { firstName: 'Piero', lastName: 'Volante' };
const INSTRUCTOR = { firstName: 'Anna', lastName: 'Cieli' };

describe('flightPicPerson', () => {
  it('a non-SCHOOL flight: PIC is the flight person', () => {
    expect(flightPicPerson({ flightType: 'TOURISM', isSolo: false, person: PERSON, instructor: INSTRUCTOR })).toEqual(PERSON);
  });

  it('a SCHOOL flight flown solo: PIC is the flight person (the allievo), even with an instructor on the flight', () => {
    expect(flightPicPerson({ flightType: 'SCHOOL', isSolo: true, person: PERSON, instructor: INSTRUCTOR })).toEqual(PERSON);
  });

  it('a SCHOOL flight flown dual (doppio comando): PIC is the instructor', () => {
    expect(flightPicPerson({ flightType: 'SCHOOL', isSolo: false, person: PERSON, instructor: INSTRUCTOR })).toEqual(INSTRUCTOR);
  });

  it('a SCHOOL dual flight with no instructor on record (historical, anomalous data): falls back to null', () => {
    expect(flightPicPerson({ flightType: 'SCHOOL', isSolo: false, person: PERSON, instructor: null })).toBeNull();
  });
});

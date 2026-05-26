import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { Country } from '../common/country';
import { State } from '../common/state';

@Injectable({
  providedIn: 'root'
})
export class FormServiceService {

  private countriesUrl = 'http://localhost:8080/api/countries';
  private statesUrl = 'http://localhost:8080/api/states';


  constructor(private httpClient: HttpClient) { }

  getCountries(): Observable<Country[]>{
    return this.httpClient.get<GetResponseCountries>(this.countriesUrl).pipe(
      map(response => response._embedded.countries)
    );
  }

  getStates(countryCode: string): Observable<State[]>{
    // build the search URL
    const searchUrl = `${this.statesUrl}/search/findByCountryCode?code=${countryCode}`;
    return this.httpClient.get<GetResponseStates>(searchUrl).pipe(
      map(response => response._embedded.states)
    );
  }

  getCreditCardMonths(startMonth: number): Observable<number[]>{

    let data: number[] = [];

    // make an array for credit card Month dropdown list in checkout component
    // start at the current month and loop until last month

    for (let month = startMonth; month <= 12; month++){
      data.push(month);
    }

    return of(data);
  }

  getCreditCardYears(): Observable<number[]>{

    let data: number[] = [];

    // make an array for credit card Year dropdown list in checkout component
    // start at the current year and loop until next ten years

    const startYear = new Date().getFullYear();
    const endYear = startYear + 10;
    for (let year = startYear; year <= endYear; year++){
      data.push(year);
    }

    return of(data);
  }
}

interface GetResponseCountries {
  _embedded: {
    countries: Country[];
  }
}

interface GetResponseStates {
  _embedded: {
    states: State[];
  }
}
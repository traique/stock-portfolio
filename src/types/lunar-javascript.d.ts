declare module 'lunar-javascript' {
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar;
    getLunar(): {
      getDay(): number;
      getMonth(): number;
      getYear(): number;
    };
  }
}

/**
 * Banner can throttle a client without saying so. It answers HTTP 200 with
 * {"success":true,"totalCount":0,"data":null} instead of an error, which looks
 * exactly like a class with no sections. A genuinely empty class comes back as
 * data: [] (checked on GSU, CSC 4351 in Spring 2027).
 *
 * The shape has been seen at Georgia Tech and not yet at GSU, but the check
 * applies to every school.
 */
export class BannerThrottledError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BannerThrottledError'
  }
}

export function isThrottled(err: unknown): err is BannerThrottledError {
  return err instanceof BannerThrottledError
}

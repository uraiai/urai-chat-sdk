/**
 * Shared server fakes for the widget test suites. Private and unbuilt —
 * consumed from source via the `@uraiai/chat-test-support` workspace
 * alias, so there is no build step to keep in sync.
 */
export {
  FakeEventSource,
  installFakeEventSource,
} from "./event-source";

export {
  installFakeFetch,
  respond,
  flushAsync,
  type FakeFetchCall,
  type FakeResponseSpec,
  type RouteTable,
} from "./fetch";

export {
  makeFakeTransport,
  type FakeTransport,
  type FakeTransportCall,
  type FakeTransportOptions,
} from "./fake-transport";

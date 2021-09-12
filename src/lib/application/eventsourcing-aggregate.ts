/*
 * Copyright 2021 Fraktalio D.O.O. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "
 * AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific
 * language governing permissions and limitations under the License.
 */

/* eslint-disable functional/no-class,functional/no-this-expression */

/* eslint-disable functional/prefer-type-literal */

import { Decider } from '../domain/decider';
import { Saga } from '../domain/saga';

/**
 * Event sourcing aggregate is using/delegating a `EventSourcingAggregate.decider` of type `Decider`<`C`, `S`, `E`> to handle commands and produce events.
 * In order to handle the command, aggregate needs to fetch the current state (represented as a list of events) via `EventRepository.fetchEvents` function, and then delegate the command to the `EventSourcingAggregate.decider` which can produce new event(s) as a result.
 *
 * If the `EventSourcingAggregate.decider` is combined out of many deciders via `combine` function, an optional `EventSourcingAggregate.saga` could be used to react on new events and send new commands to the `EventSourcingAggregate.decider` recursively, in one transaction.
 *
 * Produced events are then stored via `EventRepository.save` function.
 *
 * @typeParam C - Commands of type `C` that this aggregate can handle
 * @typeParam S - Aggregate state of type `S`
 * @typeParam E - Events of type `E` that this aggregate can publish
 *
 * @author Иван Дугалић / Ivan Dugalic / @idugalic
 */
export class EventSourcingAggregate<C, S, E> {
  /**
   * @constructor Creates `EventSourcingAggregate`
   *
   * @param decider - A decider component of type `Decider`<`C`, `S`, `E`>.
   * @param eventRepository - Interface for `E`vent management/persistence
   * @param saga - An optional saga component of type `Saga`<`E`, `C`>
   */
  constructor(
    private readonly decider: Decider<C, S, E>,
    private readonly eventRepository: EventRepository<C, E>,
    private readonly saga?: Saga<E, C>
  ) {}

  private calculateNewEvents(events: readonly E[], command: C): readonly E[] {
    const currentState = events.reduce(
      this.decider.evolve,
      this.decider.initialState
    );
    // eslint-disable-next-line functional/no-let
    let resultingEvents = this.decider.decide(command, currentState);

    if (typeof this.saga !== 'undefined') {
      const saga = this.saga;
      resultingEvents
        .flatMap((it) => saga.react(it))
        .forEach(
          (c) =>
            (resultingEvents = resultingEvents.concat(
              this.calculateNewEvents(events.concat(resultingEvents), c)
            ))
        );
    }
    return resultingEvents;
  }
  /**
   * Handles the command of type `C`, and returns new persisted events.
   *
   * @param command - Command of type `C`
   * @return list of persisted events ot type `E`
   */
  handle(command: C): readonly E[] {
    return this.eventRepository.saveAll(
      this.calculateNewEvents(
        this.eventRepository.fetchEvents(command),
        command
      )
    );
  }
}

/**
 * Event repository interface
 *
 * Used by [[EventSourcingAggregate]]
 *
 * @param C - Command
 * @param E - Event
 *
 * @author Иван Дугалић / Ivan Dugalic / @idugalic
 */
export interface EventRepository<C, E> {
  /**
   * Fetch events
   *
   * @param c - Command of type `C`
   *
   * @return list of Events of type `E`
   */
  readonly fetchEvents: (c: C) => readonly E[];

  /**
   * Save event
   *
   * @param e - Event of type `E`
   * @return newly saved Event of type `E`
   */
  readonly save: (e: E) => E;

  /**
   * Save events
   *
   * @param eList - list of Events of type `E`
   * @return newly saved list of Events of type `E`
   */
  readonly saveAll: (eList: readonly E[]) => readonly E[];
}
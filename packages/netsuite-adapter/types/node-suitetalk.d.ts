
/*
*                      Copyright 2020 Salto Labs Ltd.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with
* the License.  You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

declare module 'node-suitetalk' {
  export class Service {
    constructor(config: Configuration)
    init(): Promise<void>
    getList(recordRefs: Record.Types.RecordRef[]): Promise<GetListResponse>
    getCustomizationId(type: string, includeInactives?: boolean):
      Promise<GetCustomizationIdResponse>
  }

  export interface Token {
    consumer_key: string
    consumer_secret: string
    token_key: string
    token_secret: string
  }

  export namespace Record {
    export namespace Types {
      export class RecordRef {
        constructor()
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        [key: string]: any
      }

      // eslint-disable-next-line no-shadow
      export class Record {
        constructor()
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        [key: string]: any
      }
    }
  }

  export class Configuration {
    constructor(config: Configuration)
    account: string
    apiVersion: string
    accountSpecificUrl: boolean
    token: Token
    wsdlPath: string
  }

  export interface StatusDetail {
    code: string
    message: string
    afterSubmitFailed: boolean
  }

  export interface Status {
    statusDetail: StatusDetail
    $attributes: {
      isSuccess: boolean
    }
  }

  export interface ReadResponse {
    status: Status
    record: Record.Types.Record
  }

  export interface ReadResponseList {
    status: Status
    readResponse: ReadResponse[]
  }

  export interface GetListResponse {
    readResponseList: ReadResponseList
  }

  export interface RecordRefList {
    customizationRef: Record.Types.RecordRef[]
  }

  export interface GetCustomizationIdResult {
    status: Status
    totalRecords: number
    customizationRefList: RecordRefList
  }

  export interface GetCustomizationIdResponse {
    getCustomizationIdResult: GetCustomizationIdResult
  }
}
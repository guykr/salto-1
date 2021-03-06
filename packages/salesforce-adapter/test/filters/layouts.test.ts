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
import {
  ObjectType, ElemID, InstanceElement, CORE_ANNOTATIONS, ReferenceExpression,
  BuiltinTypes,
} from '@salto-io/adapter-api'
import {
  naclCase, pathNaclCase,
} from '@salto-io/adapter-utils'
import makeFilter, { LAYOUT_TYPE_ID } from '../../src/filters/layouts'
import * as constants from '../../src/constants'
import { FilterWith } from '../../src/filter'
import mockClient from '../client'

describe('Test layout filter', () => {
  const { client } = mockClient()

  const mockSObject = new ObjectType({
    elemID: new ElemID(constants.SALESFORCE, 'test'),
    annotations: { [constants.METADATA_TYPE]: constants.CUSTOM_OBJECT },
  })

  const filter = makeFilter({ client, config: {} }) as FilterWith<'onFetch'>

  describe('Test layout fetch', () => {
    const fetch = async (apiName: string, opts = { fixedName: true }): Promise<void> => {
      const testSobjPath = [constants.SALESFORCE, constants.OBJECTS_PATH, 'test', 'standard']
      const testSObj = mockSObject.clone()
      testSObj.annotate({ [constants.API_NAME]: apiName })
      testSObj.path = testSobjPath

      const shortName = 'Test Layout'
      const fullName = `${apiName}-${shortName}`
      const instName = naclCase(opts.fixedName ? shortName : fullName)
      const testLayout = new InstanceElement(
        instName,
        new ObjectType({
          elemID: LAYOUT_TYPE_ID,
        }),
        { [constants.INSTANCE_FULL_NAME_FIELD]: fullName,
          layoutSections: {
            layoutColumns: {
              layoutItems: [{
                field: 'foo',
              }, {
                field: 'bar',
              }, {
                customLink: 'link',
              }, {
                field: 'moo',
              }],
            },
          } },
        [constants.RECORDS_PATH, 'Layout', instName]
      )
      const standardFieldObj = new ObjectType({
        elemID: testSObj.elemID,
        path: [constants.SALESFORCE],
        fields: { foo: { type: BuiltinTypes.STRING, annotations: { apiName: 'foo' } } },
      })
      const customFieldObj = new ObjectType({
        elemID: testSObj.elemID,
        path: [constants.SALESFORCE],
        fields: { bar: { type: BuiltinTypes.STRING, annotations: { apiName: 'bar' } } },
      })

      const webLinkObj = new ObjectType({
        elemID: new ElemID(constants.SALESFORCE, 'WebLink'),
        path: [constants.SALESFORCE],
        fields: {},
      })

      const webLinkInst = new InstanceElement(
        'link',
        webLinkObj,
        {
          [constants.INSTANCE_FULL_NAME_FIELD]: `${apiName}.link`,
        },
      )

      const elements = [
        testSObj, testLayout, standardFieldObj, customFieldObj, webLinkObj, webLinkInst,
      ]

      await filter.onFetch(elements)

      const instance = elements[1] as InstanceElement
      expect(instance.elemID).toEqual(LAYOUT_TYPE_ID.createNestedID('instance', naclCase(shortName)))
      expect(instance.path).toEqual([...testSobjPath.slice(0, -1), 'Layout', pathNaclCase(instance.elemID.name)])

      expect(instance.annotations[CORE_ANNOTATIONS.PARENT]).toContainEqual(
        new ReferenceExpression(testSObj.elemID)
      )
    }

    it('should add relation between layout to related sobject', async () => {
      await fetch('Test')
    })
    it('should add relation between layout to related custom sobject', async () => {
      await fetch('Test__c')
    })
    it('should not transform instance name if it is already fixed', async () => {
      await fetch('Test', { fixedName: true })
    })
  })
})

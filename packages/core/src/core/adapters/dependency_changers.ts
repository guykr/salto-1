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
import wu from 'wu'
import _ from 'lodash'
import { values } from '@salto-io/lowerdash'
import { DependencyChanger, getChangeElement, Adapter } from '@salto-io/adapter-api'
import adapterCreators from './creators'

type AdapterDependencyChanger = (name: string, changer: DependencyChanger) => DependencyChanger
const adapterDependencyChanger: AdapterDependencyChanger = (name, changer) => (changes, deps) => {
  const filteredChanges = new Map(
    wu(changes.entries())
      .filter(([_id, change]) => getChangeElement(change).elemID.adapter === name)
  )
  const filteredDeps = new Map(
    wu(deps.entries())
      .filter(([id]) => filteredChanges.has(id))
      .map(([id, idDeps]) => [id, new Set(wu(idDeps).filter(dep => filteredChanges.has(dep)))])
  )
  return changer(filteredChanges, filteredDeps)
}

export const getAdapterDependencyChangers = (
  creators: Record<string, Adapter> = adapterCreators,
): ReadonlyArray<DependencyChanger> => (
  _(creators)
    .mapValues(({ deployModifiers }) => deployModifiers?.dependencyChanger)
    .pickBy(values.isDefined)
    .mapValues((changer, name) => adapterDependencyChanger(name, changer))
    .values()
    .value()
)

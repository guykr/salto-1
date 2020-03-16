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
import {
  ObjectType,
  ElemID,
  PrimitiveType,
  Values,
  Value,
  Element,
  isInstanceElement,
  InstanceElement,
  isPrimitiveType,
  PrimitiveValue,
  TypeMap,
  isField,
  isReferenceExpression,
  ReferenceExpression,
  Field, InstanceAnnotationTypes, isType, isObjectType,
} from '@salto-io/adapter-api'


export const bpCase = (name?: string): string => (
  // unescape changes HTML escaped parts (&gt; for example), then the regex
  // replaces url escaped chars as well as any special character to keep names blueprint friendly
  // Match multiple consecutive chars to compact names and avoid repeated _
  name ? _.unescape(name).replace(/((%[0-9A-F]{2})|[^\w\d])+/g, '_') : ''
)

type PrimitiveField = Field & {type: PrimitiveType}

export type TransformPrimitiveFunc = (
  val: PrimitiveValue, pathID?: ElemID, type?: PrimitiveField)
  => PrimitiveValue | ReferenceExpression | undefined

export type TransformReferenceFunc = (
  val: ReferenceExpression, pathID?: ElemID
) => Value | ReferenceExpression

export const transformValues = (
  {
    values,
    type,
    transformPrimitives = v => v,
    transformReferences = v => v,
    strict = true,
    pathID = undefined,
  }: {
    values: Value
    type: ObjectType | TypeMap
    transformPrimitives?: TransformPrimitiveFunc
    transformReferences?: TransformReferenceFunc
    strict?: boolean
    pathID?: ElemID
  }
): Values | undefined => {
  const transformValue = (value: Value, keyPathID?: ElemID, field?: Field): Value => {
    if (field === undefined) {
      return strict ? undefined : value
    }

    if (isReferenceExpression(value)) {
      return transformReferences(value, keyPathID)
    }

    if (_.isArray(value)) {
      const transformed = value
        .map((item, index) => transformValue(item, keyPathID?.createNestedID(String(index)), field))
        .filter(val => !_.isUndefined(val))
      return transformed.length === 0 ? undefined : transformed
    }

    if (isPrimitiveType(field.type)) {
      return transformPrimitives(value, keyPathID, field as PrimitiveField)
    }
    if (isObjectType(field.type)) {
      const transformed = _.omitBy(
        transformValues({
          values: value,
          type: field.type,
          transformPrimitives,
          transformReferences,
          strict,
          pathID: keyPathID,
        }),
        _.isUndefined
      )
      return _.isEmpty(transformed) ? undefined : transformed
    }
    return undefined
  }

  const fieldMap = isObjectType(type)
    ? type.fields
    : _.mapValues(type, (fieldType, name) => new Field(new ElemID(''), name, fieldType))

  const result = _(values)
    .mapValues((value, key) => transformValue(value, pathID?.createNestedID(key), fieldMap[key]))
    .omitBy(_.isUndefined)
    .value()
  return _.isEmpty(result) ? undefined : result
}

export const transformElement = <T extends Element>(
  {
    element,
    transformPrimitives,
    transformReferences,
    strict,
  }: {
    element: T
    transformPrimitives?: TransformPrimitiveFunc
    transformReferences?: TransformReferenceFunc
    strict?: boolean
  }
): T => {
  let newElement: Element

  const elementAnnotationTypes = (): TypeMap => {
    if (isInstanceElement(element)) {
      return InstanceAnnotationTypes
    }

    if (isField(element)) {
      return element.type.annotationTypes
    }

    return element.annotationTypes
  }

  const transformedAnnotations = transformValues({
    values: element.annotations,
    type: elementAnnotationTypes(),
    transformPrimitives,
    transformReferences,
    strict,
    pathID: isType(element) ? element.elemID.createNestedID('attr') : element.elemID,
  }) || {}

  if (isInstanceElement(element)) {
    const transformedValues = transformValues({
      values: element.value,
      type: element.type,
      transformPrimitives,
      transformReferences,
      strict,
      pathID: element.elemID,
    }) || {}

    newElement = new InstanceElement(
      element.elemID.name,
      element.type,
      transformedValues,
      element.path,
      transformedAnnotations
    )
    return newElement as T
  }

  if (isObjectType(element)) {
    const clonedFields = _.mapValues(
      element.fields,
      field => transformElement(
        {
          element: field,
          transformPrimitives,
          transformReferences,
          strict,
        }
      )
    )

    newElement = new ObjectType({
      elemID: element.elemID,
      fields: clonedFields,
      annotationTypes: element.annotationTypes,
      annotations: transformedAnnotations,
      path: element.path,
      isSettings: element.isSettings,
    })

    return newElement as T
  }

  if (isField(element)) {
    newElement = new Field(
      element.parentID,
      element.name,
      element.type,
      transformedAnnotations,
      element.isList
    )
    return newElement as T
  }

  if (isPrimitiveType(element)) {
    newElement = new PrimitiveType({
      elemID: element.elemID,
      primitive: element.primitive,
      annotationTypes: element.annotationTypes,
      path: element.path,
      annotations: transformedAnnotations,
    })

    return newElement as T
  }

  throw Error('received unsupported (subtype) Element')
}

export const resolveReferences = <T extends Element>(
  element: T,
  getLookUpName: (v: Value) => Value
): T => {
  const referenceReplacer: TransformReferenceFunc = ref => getLookUpName(ref.value)

  return transformElement({
    element,
    transformReferences: referenceReplacer,
    strict: false,
  })
}

export const restoreReferences = <T extends Element>(
  source: T,
  targetElement: T,
  getLookUpName: (v: Value) => Value
): T => {
  const allReferencesPaths = new Map<string, ReferenceExpression>()
  const createPathMapCallback: TransformReferenceFunc = (val, pathID) => {
    if (pathID) {
      allReferencesPaths.set(pathID.getFullName(), val)
    }
    return val
  }

  transformElement({
    element: source,
    transformReferences: createPathMapCallback,
    strict: false,
  })

  const restoreReferencesFunc: TransformPrimitiveFunc = (val, pathID) => {
    if (pathID === undefined) {
      return val
    }

    const ref = allReferencesPaths.get(pathID.getFullName())
    if (ref !== undefined
      && _.isEqual(getLookUpName(ref.value), val)) {
      return ref
    }

    return val
  }

  return transformElement({
    element: targetElement,
    transformPrimitives: restoreReferencesFunc,
    strict: false,
  })
}

export const findElements = (elements: Iterable<Element>, id: ElemID): Iterable<Element> => (
  wu(elements).filter(e => e.elemID.isEqual(id))
)

export const findElement = (elements: Iterable<Element>, id: ElemID): Element | undefined => (
  wu(elements).find(e => e.elemID.isEqual(id))
)

export const findObjectType = (elements: Iterable<Element>, id: ElemID): ObjectType | undefined => {
  const objects = wu(elements).filter(isObjectType) as wu.WuIterable<ObjectType>
  return objects.find(e => e.elemID.isEqual(id))
}

export const findInstances = (
  elements: Iterable<Element>,
  typeID: ElemID,
): Iterable<InstanceElement> => {
  const instances = wu(elements).filter(isInstanceElement) as wu.WuIterable<InstanceElement>
  return instances.filter(e => e.type.elemID.isEqual(typeID))
}

export const resolvePath = (rootElement: Element, fullElemID: ElemID): Value => {
  const { parent, path } = fullElemID.createTopLevelParentID()
  if (!_.isEqual(parent, rootElement.elemID)) return undefined

  if (_.isEmpty(path)) {
    return rootElement
  }

  if (isInstanceElement(rootElement) && fullElemID.idType === 'instance') {
    return (!_.isEmpty(path)) ? _.get(rootElement.value, path) : rootElement
  }

  if (isObjectType(rootElement) && fullElemID.idType === 'field') {
    const fieldName = path[0]
    const fieldAnnoPath = path.slice(1)
    const field = rootElement.fields[fieldName]
    if (_.isEmpty(fieldAnnoPath)) return field
    return _.get(field?.annotations, fieldAnnoPath)
  }

  if (isType(rootElement) && fullElemID.idType === 'attr') {
    return _.get(rootElement.annotations, path)
  }

  if (isType(rootElement) && fullElemID.idType === 'annotation') {
    const annoTypeName = path[0]
    const annoTypePath = path.slice(1)
    const anno = rootElement.annotationTypes[annoTypeName]
    if (_.isEmpty(annoTypePath)) return anno
    return _.get(anno?.annotations, annoTypePath)
  }

  return undefined
}
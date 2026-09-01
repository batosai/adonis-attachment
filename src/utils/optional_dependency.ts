/** Loads an optional package and turns Node's module-resolution failure into a package error. */
export async function loadOptionalDependency<T>(
  packageName: string,
  loader: () => Promise<T> = () => import(packageName) as Promise<T>
): Promise<T> {
  try {
    return await loader()
  } catch (error) {
    if (!isModuleNotFoundError(error)) {
      throw error
    }

    const { MissingOptionalDependencyError } = await import('../errors.js')
    throw new MissingOptionalDependencyError(packageName, { cause: error })
  }
}

function isModuleNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false
  }

  return error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'MODULE_NOT_FOUND'
}

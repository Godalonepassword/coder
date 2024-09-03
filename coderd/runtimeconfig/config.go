package runtimeconfig

import (
	"context"
	"errors"
	"reflect"

	"github.com/spf13/pflag"
	"golang.org/x/xerrors"
)

var ErrKeyNotSet = xerrors.New("key is not set")

// Value wraps the type used by the serpent library for its option values.
// This gives us a seam should serpent ever move away from its current implementation.
type Value pflag.Value

// Entry is designed to wrap any type which satisfies the Value interface, which currently all serpent.Option instances do.
// serpent.Option provide configurability to Value instances, and we use this Entry type to extend the functionality of
// those Value instances.
type Entry[T Value] struct {
	k string
	v T
}

// New creates a new T instance with a defined key and value.
func New[T Value](key, val string) (out Entry[T], err error) {
	out.k = key

	if err = out.SetStartupValue(val); err != nil {
		return out, err
	}

	return out, nil
}

// MustNew is like New but panics if an error occurs.
func MustNew[T Value](key, val string) Entry[T] {
	out, err := New[T](key, val)
	if err != nil {
		panic(err)
	}
	return out
}

// val fronts the T value in the struct, and initializes it should the value be nil.
func (e *Entry[T]) val() T {
	if reflect.ValueOf(e.v).IsNil() {
		e.v = create[T]()
	}
	return e.v
}

// key returns the configured key, or fails with ErrKeyNotSet.
func (e *Entry[T]) key() (string, error) {
	if e.k == "" {
		return "", ErrKeyNotSet
	}

	return e.k, nil
}

// SetKey allows the key to be set.
func (e *Entry[T]) SetKey(k string) {
	e.k = k
}

// Set is an alias of SetStartupValue.
func (e *Entry[T]) Set(s string) error {
	return e.SetStartupValue(s)
}

// MustSet is like Set but panics on error.
func (e *Entry[T]) MustSet(s string) {
	err := e.val().Set(s)
	if err != nil {
		panic(err)
	}
}

// SetStartupValue sets the value of the wrapped field. This ONLY sets the value locally, not in the store.
// See SetRuntimeValue.
func (e *Entry[T]) SetStartupValue(s string) error {
	return e.val().Set(s)
}

// Type returns the wrapped value's type.
func (e *Entry[T]) Type() string {
	return e.val().Type()
}

// String returns the wrapper value's string representation.
func (e *Entry[T]) String() string {
	return e.val().String()
}

// StartupValue returns the wrapped type T which represents the state as of the definition of this Entry.
// This function would've been named Value, but this conflicts with a field named Value on some implementations of T in
// the serpent library; plus it's just more clear.
func (e *Entry[T]) StartupValue() T {
	return e.val()
}

// SetRuntimeValue attempts to update the runtime value of this field in the store via the given Mutator.
func (e *Entry[T]) SetRuntimeValue(ctx context.Context, m Mutator, val T) error {
	key, err := e.key()
	if err != nil {
		return err
	}

	return m.UpsertRuntimeSetting(ctx, key, val.String())
}

// UnsetRuntimeValue removes the runtime value from the store.
func (e *Entry[T]) UnsetRuntimeValue(ctx context.Context, m Mutator) error {
	key, err := e.key()
	if err != nil {
		return err
	}

	return m.DeleteRuntimeSetting(ctx, key)
}

// Resolve attempts to resolve the runtime value of this field from the store via the given Resolver.
func (e *Entry[T]) Resolve(ctx context.Context, r Resolver) (T, error) {
	var zero T

	key, err := e.key()
	if err != nil {
		return zero, err
	}

	val, err := r.GetRuntimeSetting(ctx, key)
	if err != nil {
		return zero, err
	}

	inst := create[T]()
	if err = inst.Set(val); err != nil {
		return zero, xerrors.Errorf("instantiate new %T: %w", inst, err)
	}
	return inst, nil
}

// Coalesce attempts to resolve the runtime value of this field from the store via the given Resolver. Should no runtime
// value be found, the startup value will be used.
func (e *Entry[T]) Coalesce(ctx context.Context, r Resolver) (T, error) {
	var zero T

	resolved, err := e.Resolve(ctx, r)
	if err != nil {
		if errors.Is(err, EntryNotFound) {
			return e.StartupValue(), nil
		}
		return zero, err
	}

	return resolved, nil
}
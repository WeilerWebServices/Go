// Code generated from gen/dec.rules; DO NOT EDIT.
// generated with: cd gen; go run *.go

package ssa

import "cmd/compile/internal/types"

func rewriteValuedec(v *Value) bool {
	switch v.Op {
	case OpComplexImag:
		return rewriteValuedec_OpComplexImag(v)
	case OpComplexReal:
		return rewriteValuedec_OpComplexReal(v)
	case OpIData:
		return rewriteValuedec_OpIData(v)
	case OpITab:
		return rewriteValuedec_OpITab(v)
	case OpLoad:
		return rewriteValuedec_OpLoad(v)
	case OpSliceCap:
		return rewriteValuedec_OpSliceCap(v)
	case OpSliceLen:
		return rewriteValuedec_OpSliceLen(v)
	case OpSlicePtr:
		return rewriteValuedec_OpSlicePtr(v)
	case OpStore:
		return rewriteValuedec_OpStore(v)
	case OpStringLen:
		return rewriteValuedec_OpStringLen(v)
	case OpStringPtr:
		return rewriteValuedec_OpStringPtr(v)
	}
	return false
}
func rewriteValuedec_OpComplexImag(v *Value) bool {
	v_0 := v.Args[0]
	// match: (ComplexImag (ComplexMake _ imag ))
	// result: imag
	for {
		if v_0.Op != OpComplexMake {
			break
		}
		imag := v_0.Args[1]
		v.reset(OpCopy)
		v.Type = imag.Type
		v.AddArg(imag)
		return true
	}
	return false
}
func rewriteValuedec_OpComplexReal(v *Value) bool {
	v_0 := v.Args[0]
	// match: (ComplexReal (ComplexMake real _ ))
	// result: real
	for {
		if v_0.Op != OpComplexMake {
			break
		}
		_ = v_0.Args[1]
		real := v_0.Args[0]
		v.reset(OpCopy)
		v.Type = real.Type
		v.AddArg(real)
		return true
	}
	return false
}
func rewriteValuedec_OpIData(v *Value) bool {
	v_0 := v.Args[0]
	// match: (IData (IMake _ data))
	// result: data
	for {
		if v_0.Op != OpIMake {
			break
		}
		data := v_0.Args[1]
		v.reset(OpCopy)
		v.Type = data.Type
		v.AddArg(data)
		return true
	}
	return false
}
func rewriteValuedec_OpITab(v *Value) bool {
	v_0 := v.Args[0]
	// match: (ITab (IMake itab _))
	// result: itab
	for {
		if v_0.Op != OpIMake {
			break
		}
		_ = v_0.Args[1]
		itab := v_0.Args[0]
		v.reset(OpCopy)
		v.Type = itab.Type
		v.AddArg(itab)
		return true
	}
	return false
}
func rewriteValuedec_OpLoad(v *Value) bool {
	v_1 := v.Args[1]
	v_0 := v.Args[0]
	b := v.Block
	config := b.Func.Config
	typ := &b.Func.Config.Types
	// match: (Load <t> ptr mem)
	// cond: t.IsComplex() && t.Size() == 8
	// result: (ComplexMake (Load <typ.Float32> ptr mem) (Load <typ.Float32> (OffPtr <typ.Float32Ptr> [4] ptr) mem) )
	for {
		t := v.Type
		ptr := v_0
		mem := v_1
		if !(t.IsComplex() && t.Size() == 8) {
			break
		}
		v.reset(OpComplexMake)
		v0 := b.NewValue0(v.Pos, OpLoad, typ.Float32)
		v0.AddArg(ptr)
		v0.AddArg(mem)
		v.AddArg(v0)
		v1 := b.NewValue0(v.Pos, OpLoad, typ.Float32)
		v2 := b.NewValue0(v.Pos, OpOffPtr, typ.Float32Ptr)
		v2.AuxInt = 4
		v2.AddArg(ptr)
		v1.AddArg(v2)
		v1.AddArg(mem)
		v.AddArg(v1)
		return true
	}
	// match: (Load <t> ptr mem)
	// cond: t.IsComplex() && t.Size() == 16
	// result: (ComplexMake (Load <typ.Float64> ptr mem) (Load <typ.Float64> (OffPtr <typ.Float64Ptr> [8] ptr) mem) )
	for {
		t := v.Type
		ptr := v_0
		mem := v_1
		if !(t.IsComplex() && t.Size() == 16) {
			break
		}
		v.reset(OpComplexMake)
		v0 := b.NewValue0(v.Pos, OpLoad, typ.Float64)
		v0.AddArg(ptr)
		v0.AddArg(mem)
		v.AddArg(v0)
		v1 := b.NewValue0(v.Pos, OpLoad, typ.Float64)
		v2 := b.NewValue0(v.Pos, OpOffPtr, typ.Float64Ptr)
		v2.AuxInt = 8
		v2.AddArg(ptr)
		v1.AddArg(v2)
		v1.AddArg(mem)
		v.AddArg(v1)
		return true
	}
	// match: (Load <t> ptr mem)
	// cond: t.IsString()
	// result: (StringMake (Load <typ.BytePtr> ptr mem) (Load <typ.Int> (OffPtr <typ.IntPtr> [config.PtrSize] ptr) mem))
	for {
		t := v.Type
		ptr := v_0
		mem := v_1
		if !(t.IsString()) {
			break
		}
		v.reset(OpStringMake)
		v0 := b.NewValue0(v.Pos, OpLoad, typ.BytePtr)
		v0.AddArg(ptr)
		v0.AddArg(mem)
		v.AddArg(v0)
		v1 := b.NewValue0(v.Pos, OpLoad, typ.Int)
		v2 := b.NewValue0(v.Pos, OpOffPtr, typ.IntPtr)
		v2.AuxInt = config.PtrSize
		v2.AddArg(ptr)
		v1.AddArg(v2)
		v1.AddArg(mem)
		v.AddArg(v1)
		return true
	}
	// match: (Load <t> ptr mem)
	// cond: t.IsSlice()
	// result: (SliceMake (Load <t.Elem().PtrTo()> ptr mem) (Load <typ.Int> (OffPtr <typ.IntPtr> [config.PtrSize] ptr) mem) (Load <typ.Int> (OffPtr <typ.IntPtr> [2*config.PtrSize] ptr) mem))
	for {
		t := v.Type
		ptr := v_0
		mem := v_1
		if !(t.IsSlice()) {
			break
		}
		v.reset(OpSliceMake)
		v0 := b.NewValue0(v.Pos, OpLoad, t.Elem().PtrTo())
		v0.AddArg(ptr)
		v0.AddArg(mem)
		v.AddArg(v0)
		v1 := b.NewValue0(v.Pos, OpLoad, typ.Int)
		v2 := b.NewValue0(v.Pos, OpOffPtr, typ.IntPtr)
		v2.AuxInt = config.PtrSize
		v2.AddArg(ptr)
		v1.AddArg(v2)
		v1.AddArg(mem)
		v.AddArg(v1)
		v3 := b.NewValue0(v.Pos, OpLoad, typ.Int)
		v4 := b.NewValue0(v.Pos, OpOffPtr, typ.IntPtr)
		v4.AuxInt = 2 * config.PtrSize
		v4.AddArg(ptr)
		v3.AddArg(v4)
		v3.AddArg(mem)
		v.AddArg(v3)
		return true
	}
	// match: (Load <t> ptr mem)
	// cond: t.IsInterface()
	// result: (IMake (Load <typ.Uintptr> ptr mem) (Load <typ.BytePtr> (OffPtr <typ.BytePtrPtr> [config.PtrSize] ptr) mem))
	for {
		t := v.Type
		ptr := v_0
		mem := v_1
		if !(t.IsInterface()) {
			break
		}
		v.reset(OpIMake)
		v0 := b.NewValue0(v.Pos, OpLoad, typ.Uintptr)
		v0.AddArg(ptr)
		v0.AddArg(mem)
		v.AddArg(v0)
		v1 := b.NewValue0(v.Pos, OpLoad, typ.BytePtr)
		v2 := b.NewValue0(v.Pos, OpOffPtr, typ.BytePtrPtr)
		v2.AuxInt = config.PtrSize
		v2.AddArg(ptr)
		v1.AddArg(v2)
		v1.AddArg(mem)
		v.AddArg(v1)
		return true
	}
	return false
}
func rewriteValuedec_OpSliceCap(v *Value) bool {
	v_0 := v.Args[0]
	// match: (SliceCap (SliceMake _ _ cap))
	// result: cap
	for {
		if v_0.Op != OpSliceMake {
			break
		}
		cap := v_0.Args[2]
		v.reset(OpCopy)
		v.Type = cap.Type
		v.AddArg(cap)
		return true
	}
	return false
}
func rewriteValuedec_OpSliceLen(v *Value) bool {
	v_0 := v.Args[0]
	// match: (SliceLen (SliceMake _ len _))
	// result: len
	for {
		if v_0.Op != OpSliceMake {
			break
		}
		_ = v_0.Args[2]
		len := v_0.Args[1]
		v.reset(OpCopy)
		v.Type = len.Type
		v.AddArg(len)
		return true
	}
	return false
}
func rewriteValuedec_OpSlicePtr(v *Value) bool {
	v_0 := v.Args[0]
	// match: (SlicePtr (SliceMake ptr _ _ ))
	// result: ptr
	for {
		if v_0.Op != OpSliceMake {
			break
		}
		_ = v_0.Args[2]
		ptr := v_0.Args[0]
		v.reset(OpCopy)
		v.Type = ptr.Type
		v.AddArg(ptr)
		return true
	}
	return false
}
func rewriteValuedec_OpStore(v *Value) bool {
	v_2 := v.Args[2]
	v_1 := v.Args[1]
	v_0 := v.Args[0]
	b := v.Block
	config := b.Func.Config
	typ := &b.Func.Config.Types
	// match: (Store {t} dst (ComplexMake real imag) mem)
	// cond: t.(*types.Type).Size() == 8
	// result: (Store {typ.Float32} (OffPtr <typ.Float32Ptr> [4] dst) imag (Store {typ.Float32} dst real mem))
	for {
		t := v.Aux
		dst := v_0
		if v_1.Op != OpComplexMake {
			break
		}
		imag := v_1.Args[1]
		real := v_1.Args[0]
		mem := v_2
		if !(t.(*types.Type).Size() == 8) {
			break
		}
		v.reset(OpStore)
		v.Aux = typ.Float32
		v0 := b.NewValue0(v.Pos, OpOffPtr, typ.Float32Ptr)
		v0.AuxInt = 4
		v0.AddArg(dst)
		v.AddArg(v0)
		v.AddArg(imag)
		v1 := b.NewValue0(v.Pos, OpStore, types.TypeMem)
		v1.Aux = typ.Float32
		v1.AddArg(dst)
		v1.AddArg(real)
		v1.AddArg(mem)
		v.AddArg(v1)
		return true
	}
	// match: (Store {t} dst (ComplexMake real imag) mem)
	// cond: t.(*types.Type).Size() == 16
	// result: (Store {typ.Float64} (OffPtr <typ.Float64Ptr> [8] dst) imag (Store {typ.Float64} dst real mem))
	for {
		t := v.Aux
		dst := v_0
		if v_1.Op != OpComplexMake {
			break
		}
		imag := v_1.Args[1]
		real := v_1.Args[0]
		mem := v_2
		if !(t.(*types.Type).Size() == 16) {
			break
		}
		v.reset(OpStore)
		v.Aux = typ.Float64
		v0 := b.NewValue0(v.Pos, OpOffPtr, typ.Float64Ptr)
		v0.AuxInt = 8
		v0.AddArg(dst)
		v.AddArg(v0)
		v.AddArg(imag)
		v1 := b.NewValue0(v.Pos, OpStore, types.TypeMem)
		v1.Aux = typ.Float64
		v1.AddArg(dst)
		v1.AddArg(real)
		v1.AddArg(mem)
		v.AddArg(v1)
		return true
	}
	// match: (Store dst (StringMake ptr len) mem)
	// result: (Store {typ.Int} (OffPtr <typ.IntPtr> [config.PtrSize] dst) len (Store {typ.BytePtr} dst ptr mem))
	for {
		dst := v_0
		if v_1.Op != OpStringMake {
			break
		}
		len := v_1.Args[1]
		ptr := v_1.Args[0]
		mem := v_2
		v.reset(OpStore)
		v.Aux = typ.Int
		v0 := b.NewValue0(v.Pos, OpOffPtr, typ.IntPtr)
		v0.AuxInt = config.PtrSize
		v0.AddArg(dst)
		v.AddArg(v0)
		v.AddArg(len)
		v1 := b.NewValue0(v.Pos, OpStore, types.TypeMem)
		v1.Aux = typ.BytePtr
		v1.AddArg(dst)
		v1.AddArg(ptr)
		v1.AddArg(mem)
		v.AddArg(v1)
		return true
	}
	// match: (Store dst (SliceMake ptr len cap) mem)
	// result: (Store {typ.Int} (OffPtr <typ.IntPtr> [2*config.PtrSize] dst) cap (Store {typ.Int} (OffPtr <typ.IntPtr> [config.PtrSize] dst) len (Store {typ.BytePtr} dst ptr mem)))
	for {
		dst := v_0
		if v_1.Op != OpSliceMake {
			break
		}
		cap := v_1.Args[2]
		ptr := v_1.Args[0]
		len := v_1.Args[1]
		mem := v_2
		v.reset(OpStore)
		v.Aux = typ.Int
		v0 := b.NewValue0(v.Pos, OpOffPtr, typ.IntPtr)
		v0.AuxInt = 2 * config.PtrSize
		v0.AddArg(dst)
		v.AddArg(v0)
		v.AddArg(cap)
		v1 := b.NewValue0(v.Pos, OpStore, types.TypeMem)
		v1.Aux = typ.Int
		v2 := b.NewValue0(v.Pos, OpOffPtr, typ.IntPtr)
		v2.AuxInt = config.PtrSize
		v2.AddArg(dst)
		v1.AddArg(v2)
		v1.AddArg(len)
		v3 := b.NewValue0(v.Pos, OpStore, types.TypeMem)
		v3.Aux = typ.BytePtr
		v3.AddArg(dst)
		v3.AddArg(ptr)
		v3.AddArg(mem)
		v1.AddArg(v3)
		v.AddArg(v1)
		return true
	}
	// match: (Store dst (IMake itab data) mem)
	// result: (Store {typ.BytePtr} (OffPtr <typ.BytePtrPtr> [config.PtrSize] dst) data (Store {typ.Uintptr} dst itab mem))
	for {
		dst := v_0
		if v_1.Op != OpIMake {
			break
		}
		data := v_1.Args[1]
		itab := v_1.Args[0]
		mem := v_2
		v.reset(OpStore)
		v.Aux = typ.BytePtr
		v0 := b.NewValue0(v.Pos, OpOffPtr, typ.BytePtrPtr)
		v0.AuxInt = config.PtrSize
		v0.AddArg(dst)
		v.AddArg(v0)
		v.AddArg(data)
		v1 := b.NewValue0(v.Pos, OpStore, types.TypeMem)
		v1.Aux = typ.Uintptr
		v1.AddArg(dst)
		v1.AddArg(itab)
		v1.AddArg(mem)
		v.AddArg(v1)
		return true
	}
	return false
}
func rewriteValuedec_OpStringLen(v *Value) bool {
	v_0 := v.Args[0]
	// match: (StringLen (StringMake _ len))
	// result: len
	for {
		if v_0.Op != OpStringMake {
			break
		}
		len := v_0.Args[1]
		v.reset(OpCopy)
		v.Type = len.Type
		v.AddArg(len)
		return true
	}
	return false
}
func rewriteValuedec_OpStringPtr(v *Value) bool {
	v_0 := v.Args[0]
	// match: (StringPtr (StringMake ptr _))
	// result: ptr
	for {
		if v_0.Op != OpStringMake {
			break
		}
		_ = v_0.Args[1]
		ptr := v_0.Args[0]
		v.reset(OpCopy)
		v.Type = ptr.Type
		v.AddArg(ptr)
		return true
	}
	return false
}
func rewriteBlockdec(b *Block) bool {
	switch b.Kind {
	}
	return false
}
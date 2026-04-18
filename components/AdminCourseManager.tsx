
import React, { useState, useEffect } from 'react';
import { GolfCourse } from '../types';
import { Button } from './Button';
import { MapPin, Plus, Save, Trash2, Search, AlertCircle } from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { storageService } from '../services/storage';

interface AdminCourseManagerProps {
  isFirebaseMode: boolean;
}

export const AdminCourseManager: React.FC<AdminCourseManagerProps> = ({ isFirebaseMode }) => {
  const [courses, setCourses] = useState<GolfCourse[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form State
  const [isEditing, setIsEditing] = useState(false);
  const [courseName, setCourseName] = useState('');
  const [pars, setPars] = useState<number[]>(Array(18).fill(4)); // Default par 4
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadCourses();
  }, [isFirebaseMode]);

  const loadCourses = async () => {
    let data: GolfCourse[] = [];
    if (isFirebaseMode) {
      data = await firebaseService.getGolfCourses();
    } else {
      data = storageService.getGolfCourses();
    }
    setCourses(data);
  };

  const resetForm = () => {
    setCourseName('');
    setPars(Array(18).fill(4));
    setIsEditing(false);
    setEditingId(null);
  };

  const handleEdit = (course: GolfCourse) => {
    setCourseName(course.name);
    setPars([...course.pars]);
    setEditingId(course.id);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!courseName.trim()) {
      alert("골프장 이름을 입력해주세요.");
      return;
    }

    const course: GolfCourse = {
      id: editingId || crypto.randomUUID(),
      name: courseName.trim(),
      pars: pars,
      createdAt: Date.now()
    };

    if (isFirebaseMode) {
      await firebaseService.saveGolfCourse(course);
    } else {
      storageService.saveGolfCourse(course);
    }

    resetForm();
    loadCourses();
    alert("저장되었습니다.");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    if (isFirebaseMode) {
      await firebaseService.deleteGolfCourse(id);
    } else {
      storageService.deleteGolfCourse(id);
    }
    loadCourses();
  };

  const handleParChange = (index: number, value: number) => {
    const newPars = [...pars];
    newPars[index] = value;
    setPars(newPars);
  };

  const filteredCourses = courses.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <MapPin className="w-5 h-5" /> 골프장 정보 관리
        </h2>
        <Button onClick={() => { resetForm(); setIsEditing(true); }} icon={<Plus className="w-4 h-4" />}>
          새 골프장 등록
        </Button>
      </div>

      {isEditing ? (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-fade-in">
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-700 mb-2">골프장 이름</label>
            <input 
              type="text" 
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="예: 스카이72 오션코스"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-700 outline-none"
            />
          </div>

          <div className="mb-6">
            <h4 className="text-sm font-bold text-gray-700 mb-3">홀별 Par 설정</h4>
            
            {/* OUT COURSE (1-9) */}
            <div className="mb-4">
              <span className="text-xs font-bold text-gray-500 block mb-2">OUT / 전반 (1-9)</span>
              <div className="grid grid-cols-9 gap-2">
                {pars.slice(0, 9).map((par, i) => (
                  <div key={i} className="text-center">
                    <label className="block text-xs text-gray-400 mb-1">{i + 1}H</label>
                    <input 
                      type="number" 
                      value={par}
                      onChange={(e) => handleParChange(i, Number(e.target.value))}
                      className="w-full text-center border border-gray-300 rounded py-1 text-sm font-bold focus:border-emerald-700 outline-none"
                      min="3" max="6"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* IN COURSE (10-18) */}
            <div>
              <span className="text-xs font-bold text-gray-500 block mb-2">IN / 후반 (10-18)</span>
              <div className="grid grid-cols-9 gap-2">
                {pars.slice(9, 18).map((par, i) => (
                  <div key={i + 9} className="text-center">
                    <label className="block text-xs text-gray-400 mb-1">{i + 10}H</label>
                    <input 
                      type="number" 
                      value={par}
                      onChange={(e) => handleParChange(i + 9, Number(e.target.value))}
                      className="w-full text-center border border-gray-300 rounded py-1 text-sm font-bold focus:border-emerald-700 outline-none"
                      min="3" max="6"
                    />
                  </div>
                ))}
              </div>
            </div>
            
            <div className="mt-2 text-right text-xs text-gray-500">
              Total Par: {pars.reduce((a, b) => a + b, 0)}
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={resetForm}>취소</Button>
            <Button onClick={handleSave} icon={<Save className="w-4 h-4" />}>저장</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="골프장 이름 검색..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {filteredCourses.length === 0 ? (
              <div className="p-8 text-center text-gray-400">등록된 골프장이 없습니다.</div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3">골프장 이름</th>
                    <th className="px-6 py-3">Total Par</th>
                    <th className="px-6 py-3 text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCourses.map(course => (
                    <tr key={course.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-gray-900">{course.name}</td>
                      <td className="px-6 py-4 text-gray-600">{course.pars.reduce((a, b) => a + b, 0)}</td>
                      <td className="px-6 py-4 text-right flex justify-end gap-2">
                        <Button variant="secondary" className="py-1 px-3 text-xs" onClick={() => handleEdit(course)}>수정</Button>
                        <button onClick={() => handleDelete(course.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
